/**
 * Single choke point for ALL Gemini (Google Generative Language) calls in the app.
 *
 * SECURITY: a key read from import.meta.env.VITE_GEMINI_API_KEY is bundled into
 * the client JS and is publicly visible, so DIRECT-KEY MODE IS FOR LOCAL /
 * PRIVATE TESTING ONLY. In production set VITE_AI_PROXY_URL to a Cloudflare
 * Worker that holds the key server-side and forwards to the Gemini API; the
 * browser then sends no key at all. Adding that Worker later needs NO UI or
 * call-site changes, only the env var. If neither var is set, calls throw an
 * AiError with a clear pt-BR setup message (they never crash the app).
 *
 * The Worker should accept the same POST body this module sends (the Gemini
 * request plus a top-level `model`) and proxy it to
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent,
 * adding the x-goog-api-key header on the server side.
 */
import { buildGeneratePrompt, parseCardsJson } from './cards';
import type { GeneratedCard, GenerateRequest } from './cards';
import { supabase } from '../../lib/supabase';

/** The model used for all generation and tutoring. Single source of truth; a
 *  single call can override it via createMessage's `model` option if needed. */
export const AI_MODEL = 'gemini-2.5-flash-lite';

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL;
const DIRECT_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Carries a user-facing (pt-BR) message; safe to show in dialogs/toasts. */
export class AiError extends Error {}

/** Friendly pt-BR message for AI INFRASTRUCTURE overload (proxy error_code
 *  "ai_overloaded" / any 503): the Gemini model/shared key is congested. This is
 *  NOT a plan limit, so it must never open the UpgradeModal. */
const AI_OVERLOADED_MSG =
  'A IA está sobrecarregada neste momento. Isso costuma passar em segundos, tente de novo.';

/** Which metered action an AI call counts as. The server enforces the limit
 *  (consume_quota) and the period; the client only declares the metric. */
export type AiMetric = 'deckGen' | 'tutor' | 'image';

export interface QuotaInfo {
  metric: AiMetric | string;
  used: number;
  /** The plan's cap for the period (0 = blocked on this plan, e.g. free images). */
  limit: number;
  period: 'day' | 'month' | string;
}

/** A specific AiError thrown when the proxy (429) refuses an AI call because a
 *  plan usage limit was reached. Carries the limit details for the UI. */
export class QuotaError extends AiError {
  info: QuotaInfo;
  constructor(message: string, info: QuotaInfo) {
    super(message);
    this.info = info;
  }
}

function quotaMessage(p: { metric?: string; period?: string; max_count?: number }): string {
  const periodWord = p.period === 'month' ? 'mensal' : 'diário';
  const cap = typeof p.max_count === 'number' && p.max_count > 0 ? ` (${p.max_count})` : '';
  switch (p.metric) {
    case 'deckGen':
      return `Limite ${periodWord} de gerações de deck atingido${cap}. Tente mais tarde ou faça upgrade do plano.`;
    case 'tutor':
      return `Limite ${periodWord} de usos do tutor IA atingido${cap}. Tente mais tarde ou faça upgrade do plano.`;
    case 'image':
      return p.max_count === 0
        ? 'Geração de imagens não está disponível no seu plano. Faça upgrade para gerar imagens.'
        : `Limite ${periodWord} de imagens atingido${cap}. Faça upgrade do plano.`;
    default:
      return 'Limite de uso atingido. Tente novamente mais tarde.';
  }
}

/** Current Supabase access token (JWT) for the proxy's auth, or null. */
async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** True when either a proxy URL or a direct key is configured. */
export function isAiConfigured(): boolean {
  return Boolean(PROXY_URL || DIRECT_KEY);
}

const NOT_CONFIGURED =
  'IA não configurada. Defina VITE_AI_PROXY_URL (recomendado: um Cloudflare Worker que guarda a ' +
  'chave) ou, apenas para teste local, VITE_GEMINI_API_KEY, e refaça o build.';

export type AiBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string | AiBlock[];
}

interface CreateOptions {
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** Override the model for a single call (defaults to AI_MODEL). */
  model?: string;
  /** Which usage metric this call counts as (sent to the proxy for the limit). */
  metric: AiMetric;
}

/** One Gemini content part: plain text, or inline base64 data (PDF / image). */
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Translate our provider-neutral AiMessage into a Gemini "content" object.
 * Roles user/assistant become Gemini's user/model; a string body becomes one
 * text part; AiBlock[] maps text blocks to { text } and base64 document/image
 * blocks to { inlineData } (billed by Gemini as normal input tokens).
 */
function toGeminiContent(m: AiMessage): { role: 'user' | 'model'; parts: GeminiPart[] } {
  const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';
  const parts: GeminiPart[] =
    typeof m.content === 'string'
      ? [{ text: m.content }]
      : m.content.map((b) =>
          b.type === 'text'
            ? { text: b.text }
            : { inlineData: { mimeType: b.source.media_type, data: b.source.data } },
        );
  return { role, parts };
}

/**
 * Map a non-OK proxy/Gemini response to the right thrown error. Shared by the
 * non-streaming and streaming paths so behavior is IDENTICAL: quota_exceeded →
 * QuotaError (drives the UpgradeModal), ai_overloaded / 503 → friendly AiError
 * that never opens the paywall, etc. Always throws (return type `never`).
 */
async function throwForErrorResponse(res: Response, metric: AiMetric): Promise<never> {
  let payload:
    | {
        error?: unknown;
        /** New canonical field; `code` kept for backward compatibility. */
        error_code?: string;
        code?: string;
        metric?: string;
        period?: string;
        used?: number;
        max_count?: number;
      }
    | null = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const detail =
    typeof payload?.error === 'string'
      ? payload.error
      : (payload?.error as { message?: string } | undefined)?.message ?? '';
  const code = payload?.error_code ?? payload?.code;

  // Plan usage limit hit (429 from OUR OWN quota check). This is a real quota
  // error → keep the UpgradeModal behavior (callers open it on QuotaError).
  if (res.status === 429 && code === 'quota_exceeded') {
    throw new QuotaError(quotaMessage(payload ?? {}), {
      metric: payload?.metric ?? metric,
      used: payload?.used ?? 0,
      limit: payload?.max_count ?? 0,
      period: payload?.period ?? 'day',
    });
  }
  // AI INFRASTRUCTURE overload (proxy retried 503/429-from-Google and gave up).
  // NOT a plan limit: plain AiError with a friendly message, so it shows the
  // notice and NEVER opens the UpgradeModal.
  if (code === 'ai_overloaded') {
    throw new AiError(AI_OVERLOADED_MSG);
  }
  if (res.status === 401) {
    throw new AiError('Sua sessão expirou. Entre novamente para usar a IA.');
  }
  if (res.status === 403) {
    throw new AiError(`Acesso à IA não autorizado${detail ? `: ${detail}` : ''}.`);
  }
  if (res.status === 503 && code === 'quota_unavailable') {
    throw new AiError('Não foi possível verificar seu limite agora. Tente novamente em instantes.');
  }
  // Any other 503 from the proxy = AI overloaded (same friendly notice).
  if (res.status === 503) {
    throw new AiError(AI_OVERLOADED_MSG);
  }
  if (res.status === 429) {
    throw new AiError('Limite de uso da IA atingido. Tente novamente em instantes.');
  }
  throw new AiError(`Erro da IA (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`);
}

/** Build the Gemini request body shared by the streaming + non-streaming paths. */
function buildGeminiBody(system: string | undefined, messages: AiMessage[], maxTokens: number): unknown {
  return {
    contents: messages.map(toGeminiContent),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  };
}

/**
 * STREAMING variant of createMessage (SSE). Sends `stream: true` to the proxy and
 * reads the Server-Sent Events, calling `onToken(delta)` as each chunk of text
 * arrives, then returns the full text. Same metric/maxTokens/error handling as the
 * non-streaming path (the SERVER still checks quota BEFORE streaming, so a
 * quota_exceeded throws QuotaError before any token). Requires the proxy; in
 * direct/local mode it falls back to ONE non-streaming call (emitting the whole
 * text once) so local testing keeps working.
 */
async function createMessageStream(
  opts: CreateOptions & { onToken: (delta: string) => void; t0?: number },
): Promise<string> {
  const { system, messages, maxTokens = 4096, model = AI_MODEL, metric, onToken, t0 } = opts;
  // TEMP timing: log ms elapsed since the click (t0) at each phase boundary, so we
  // can localize the perceived delay (pre-fetch work vs network/worker vs model TTFT
  // vs generation). No-op when t0 isn't provided (non-tutor callers).
  const logT = (label: string): void => {
    if (t0 !== undefined) {
      // eslint-disable-next-line no-console
      console.log(`[tutor-timing] ${label}`, { dMs: Math.round(performance.now() - t0) });
    }
  };
  let firstTokenLogged = false;
  if (!isAiConfigured()) throw new AiError(NOT_CONFIGURED);

  // Streaming needs the proxy (SSE passthrough). Local direct-key mode falls back
  // to a single non-streaming call, then emits the whole text in one go.
  if (!PROXY_URL) {
    const text = await createMessage({ system, messages, maxTokens, model, metric });
    onToken(text);
    return text;
  }

  // Prime suspect for pre-fetch latency: getAccessToken() reads the Supabase session
  // and may trigger a token refresh (network) before we can even issue the request.
  const token = await getAccessToken();
  if (!token) throw new AiError('Faça login para usar a IA.');

  let res: Response;
  try {
    logT('fetch-start'); // delta from click INCLUDES getAccessToken() above
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, metric, stream: true, ...(buildGeminiBody(system, messages, maxTokens) as object) }),
    });
    logT('response-headers'); // delta from click: + network to worker + worker pre-stream (quota/JWKS) + model start
  } catch {
    throw new AiError('Falha de conexão com a IA. Verifique sua internet ou o proxy configurado.');
  }

  if (!res.ok) await throwForErrorResponse(res, metric);
  if (!res.body) throw new AiError('A IA não retornou conteúdo. Tente novamente.');

  // INCREMENTAL read of the response body — getReader() + TextDecoder in a loop.
  // This NEVER buffers the whole body (no res.text()/res.json()); each chunk is
  // parsed and emitted as it arrives.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  // One SSE `data:` payload = a partial GenerateContentResponse whose
  // candidates[0].content.parts[].text is the NEW chunk (delta). Returns true when
  // it emitted a token (so the loop knows to yield for a paint after a real chunk).
  const handleData = (payload: string): boolean => {
    if (!payload || payload === '[DONE]') return false;
    try {
      const obj = JSON.parse(payload) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const delta = (obj.candidates?.[0]?.content?.parts ?? [])
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('');
      if (delta) {
        full += delta;
        if (!firstTokenLogged) {
          firstTokenLogged = true;
          logT('first-token'); // delta from click: full round-trip to the first visible token
        }
        // eslint-disable-next-line no-console
        console.log('[tutor-stream] token', { t: Math.round(performance.now()), len: delta.length, total: full.length });
        onToken(delta);
        return true;
      }
    } catch {
      /* a partial / non-JSON line: ignore (the buffer keeps the incomplete tail) */
    }
    return false;
  };

  // Yield until the next ANIMATION FRAME between emitted chunks. onToken triggers a
  // React state update; the browser only PAINTS at frame boundaries. requestAnimation
  // Frame parks us right before a paint, so the just-committed token is shown before
  // we read the next one — the bubble grows token-by-token instead of dumping at the
  // end. Falls back to a macrotask where rAF is unavailable (SSR/tests).
  const yieldToPaint = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof requestAnimationFrame !== 'function') {
        setTimeout(resolve, 0); // SSR / tests: no rAF.
        return;
      }
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      requestAnimationFrame(finish);
      // A BACKGROUND tab throttles rAF to ~0fps; this fallback keeps the stream
      // moving (and finishing) even when the user isn't looking at it.
      setTimeout(finish, 100);
    });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // eslint-disable-next-line no-console
      console.log('[tutor-stream] read', { t: Math.round(performance.now()), len: chunk.length });
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('data:') && handleData(line.slice(5).trim())) {
          await yieldToPaint();
        }
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith('data:')) handleData(tail.slice(5).trim());
  } catch {
    /* mid-stream read failure: keep whatever streamed so far (best-effort) */
  }

  logT('done'); // delta from click: last token / stream end

  const out = full.trim();
  if (!out) throw new AiError('A IA não retornou conteúdo. Tente novamente.');
  return out;
}

/** Low-level Gemini generateContent call. Returns the concatenated model text.
 *  Keeps the same options shape callers used before; the translation to and from
 *  Gemini's request/response format lives entirely here. */
async function createMessage({ system, messages, maxTokens = 4096, model = AI_MODEL, metric }: CreateOptions): Promise<string> {
  if (!isAiConfigured()) throw new AiError(NOT_CONFIGURED);

  const geminiBody = {
    contents: messages.map(toGeminiContent),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  };

  // Proxy mode (production): POST the Gemini body plus `model` to the Worker,
  // which routes to Google and adds the key server-side. Direct mode (TESTING
  // ONLY): the model goes in the URL and the key ships in the bundle.
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let url: string;
  let body: unknown;
  if (PROXY_URL) {
    // Proxy mode: the user must be signed in — attach the Supabase JWT so the
    // Worker can verify them and meter the usage. The metric goes in the body.
    const token = await getAccessToken();
    if (!token) throw new AiError('Faça login para usar a IA.');
    headers['authorization'] = `Bearer ${token}`;
    url = PROXY_URL;
    body = { model, metric, ...geminiBody };
  } else {
    url = `${GEMINI_BASE}/${model}:generateContent`;
    headers['x-goog-api-key'] = DIRECT_KEY as string;
    body = geminiBody;
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new AiError('Falha de conexão com a IA. Verifique sua internet ou o proxy configurado.');
  }

  if (!res.ok) await throwForErrorResponse(res, metric);

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text)
    .filter((t): t is string => typeof t === 'string')
    .join('\n')
    .trim();
  if (!text) throw new AiError('A IA não retornou conteúdo. Tente novamente.');
  return text;
}

/** Generate flashcards for one request (one model call). */
export async function generateCards(req: GenerateRequest): Promise<GeneratedCard[]> {
  const { system, userText } = buildGeneratePrompt(req);
  const content: string | AiBlock[] =
    req.source.kind === 'pdf'
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.source.base64 } },
          { type: 'text', text: userText },
        ]
      : userText;
  const text = await createMessage({
    system,
    messages: [{ role: 'user', content }],
    maxTokens: 8000,
    metric: 'deckGen',
  });
  const cards = parseCardsJson(text);
  // The quantity selector is authoritative UNLESS the user typed a number in
  // their instructions (then they may want a specific per-type distribution):
  // never return more cards than requested if no number was given. The model can
  // over-produce despite the prompt, so this is the hard guarantee.
  const instructionsHaveNumber = /\d/.test(req.instructions ?? '');
  return instructionsHaveNumber ? cards : cards.slice(0, req.count);
}

export interface BatchProgress {
  call: number;
  got: number;
  target: number;
}

/**
 * Generate up to `target` cards in batches of at most 50 per call (the source is
 * re-sent each call with the already-generated fronts as an avoid-list, so the
 * model produces new material and we merge + de-dupe). Stops when a call adds
 * nothing new or after a safety cap of calls. Used for long PDFs / pages.
 */
export async function generateCardsBatched(
  base: Omit<GenerateRequest, 'count' | 'avoid'>,
  target: number,
  onProgress?: (p: BatchProgress) => void,
): Promise<GeneratedCard[]> {
  const all: GeneratedCard[] = [];
  const seen = new Set<string>();
  for (let call = 1; call <= 6 && all.length < target; call += 1) {
    onProgress?.({ call, got: all.length, target });
    const want = Math.min(50, target - all.length);
    const batch = await generateCards({
      ...base,
      count: want,
      avoid: all.map((c) => c.front).slice(-120),
    });
    let added = 0;
    for (const c of batch) {
      const key = c.front.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        all.push(c);
        added += 1;
      }
    }
    if (added === 0) break; // the model has nothing new to add
  }
  return all.slice(0, target);
}

export interface TutorRequest {
  /** Plain-text front of the flashcard being reviewed. */
  front: string;
  /** Plain-text back (answer). */
  back: string;
  /** Prior turns of the conversation (user/assistant), oldest first. */
  history: AiMessage[];
}

/** One tutor reply for the per-card help chat. Replies in pt-BR. */
export async function tutorReply(req: TutorRequest): Promise<string> {
  const system =
    'You are a patient tutor. The student is reviewing a flashcard. ' +
    `Front: ${req.front}. Back: ${req.back}. ` +
    'Help them understand it: give a real-world example, a simpler breakdown, an analogy, or a ' +
    'memory hook. Do not just repeat the answer. Be concise. Always reply in Brazilian Portuguese.';
  return createMessage({ system, messages: req.history, maxTokens: 1024, metric: 'tutor' });
}

/** One-shot "teach me this" for a card the student did not understand. pt-BR.
 *  Pass `onToken` to STREAM the reply token-by-token (the tutor uses this); without
 *  it, returns the full text in one shot (unchanged for any other caller). */
export async function tutorTeach(
  front: string,
  back: string,
  onToken?: (delta: string) => void,
  t0?: number, // TEMP timing: click instant, for [tutor-timing] deltas
): Promise<string> {
  const system =
    'You are a patient, encouraging tutor. The student did NOT understand this flashcard. ' +
    `Front: ${front}. Back: ${back}. ` +
    'Teach it: state the key idea, then explain simply with a concrete example or analogy that ' +
    'makes it stick. Answer in Brazilian Portuguese in a short, warm explanation. Keep it easy to ' +
    'read: break it into 1 to 3 short paragraphs separated by a BLANK LINE when it helps, and wrap ' +
    'a FEW key words or short phrases in **double asterisks** to highlight them (use sparingly — ' +
    'do not highlight whole sentences). No headings, no preamble, no other markdown.';
  const opts: CreateOptions = {
    system,
    messages: [{ role: 'user', content: 'Não entendi este card. Me ensine isso.' }],
    maxTokens: 700,
    metric: 'tutor',
  };
  return onToken ? createMessageStream({ ...opts, onToken, t0 }) : createMessage(opts);
}

export type CardAssistAction = 'example' | 'mnemonic';

/**
 * One short, single-shot AI help for a card under review: a real-world example,
 * or a memory aid (analogy + memory hook). Plain-text pt-BR, a few sentences.
 */
export async function cardAssist(
  front: string,
  back: string,
  action: CardAssistAction,
  onToken?: (delta: string) => void,
  t0?: number, // TEMP timing: click instant, for [tutor-timing] deltas
): Promise<string> {
  const ASK: Record<CardAssistAction, string> = {
    example: 'Dê UM exemplo do mundo real, concreto e curto (1 a 3 frases), que ilustre este card.',
    // "Gancho de memória" agora combina DUAS coisas numa só resposta: uma analogia
    // útil e, em seguida, um parágrafo curto com um gancho de memória/resumo.
    mnemonic:
      'Primeiro, dê UMA analogia útil e memorável para este card. ' +
      'Depois, numa linha em branco, escreva um parágrafo CURTO com um gancho de memória ' +
      '(resumo fácil de lembrar) para fixar o card.',
  };
  const system =
    'You help a student reviewing a flashcard. ' +
    `Front: ${front}. Back: ${back}. ` +
    'Answer in Brazilian Portuguese, concisely (follow the length the instruction asks for). ' +
    'Be concrete. No headings and no preamble. You MAY wrap one or two KEY words or short phrases in ' +
    '**double asterisks** to highlight them — use sparingly, never a whole sentence.';
  const opts: CreateOptions = {
    system,
    messages: [{ role: 'user', content: ASK[action] }],
    // mnemonic now returns two parts (analogy + hook), so it gets a bit more room.
    maxTokens: action === 'mnemonic' ? 550 : 400,
    metric: 'tutor',
  };
  return onToken ? createMessageStream({ ...opts, onToken, t0 }) : createMessage(opts);
}

/**
 * Turn a card's content into ONE short, concrete visual description (English) to
 * feed an image generator. Concrete imagery only (objects/scene/symbols), no
 * style words (the caller appends a fixed style) and no text-in-image.
 */
export async function describeCardVisually(front: string, back: string): Promise<string> {
  const system =
    'You turn a flashcard into a single short prompt for an illustration. ' +
    `Card front: ${front}. Card back: ${back}. ` +
    'Reply with ONE short English sentence describing concrete imagery that illustrates the ' +
    "card's core concept (objects, a scene, symbols). Do NOT include any words/letters to render " +
    'in the image, no style adjectives, no preamble, no quotes. Just the sentence.';
  const text = await createMessage({
    system,
    messages: [{ role: 'user', content: 'Describe the illustration.' }],
    maxTokens: 120,
    metric: 'image',
  });
  // One clean line, no surrounding quotes.
  return text.split('\n')[0].trim().replace(/^["']|["']$/g, '');
}
