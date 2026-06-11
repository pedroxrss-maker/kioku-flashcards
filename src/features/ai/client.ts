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

/** The model used for all generation and tutoring. Single source of truth; a
 *  single call can override it via createMessage's `model` option if needed. */
export const AI_MODEL = 'gemini-2.5-flash-lite';

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL;
const DIRECT_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Carries a user-facing (pt-BR) message; safe to show in dialogs/toasts. */
export class AiError extends Error {}

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

/** Low-level Gemini generateContent call. Returns the concatenated model text.
 *  Keeps the same options shape callers used before; the translation to and from
 *  Gemini's request/response format lives entirely here. */
async function createMessage({ system, messages, maxTokens = 4096, model = AI_MODEL }: CreateOptions): Promise<string> {
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
    url = PROXY_URL;
    body = { model, ...geminiBody };
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

  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) detail = `: ${j.error.message}`;
    } catch {
      /* ignore body parse errors */
    }
    if (res.status === 401 || res.status === 403) {
      throw new AiError(`Chave de IA inválida ou não autorizada${detail}.`);
    }
    if (res.status === 429) {
      throw new AiError('Limite de uso da IA atingido. Tente novamente em instantes.');
    }
    throw new AiError(`Erro da IA (HTTP ${res.status})${detail}.`);
  }

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
  });
  return parseCardsJson(text);
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
  return createMessage({ system, messages: req.history, maxTokens: 1024 });
}

/** One-shot "teach me this" for a card the student did not understand. pt-BR. */
export async function tutorTeach(front: string, back: string): Promise<string> {
  const system =
    'You are a patient, encouraging tutor. The student did NOT understand this flashcard. ' +
    `Front: ${front}. Back: ${back}. ` +
    'Teach it: state the key idea, then explain simply with a concrete example or analogy that ' +
    'makes it stick. Answer in Brazilian Portuguese, plain text only (no markdown, no headings), ' +
    'in a short, warm paragraph.';
  return createMessage({
    system,
    messages: [{ role: 'user', content: 'Não entendi este card. Me ensine isso.' }],
    maxTokens: 700,
  });
}

export type CardAssistAction = 'example' | 'breakdown' | 'analogy' | 'mnemonic';

/**
 * One short, single-shot AI help for a card under review: a real-world example,
 * a breakdown, an analogy, or a memory hook. Plain-text pt-BR, a few sentences.
 */
export async function cardAssist(
  front: string,
  back: string,
  action: CardAssistAction,
): Promise<string> {
  const ASK: Record<CardAssistAction, string> = {
    example: 'Dê UM exemplo do mundo real, concreto e curto, que ilustre este card.',
    breakdown: 'Explique este card dividido em partes simples, num passo a passo bem curto.',
    analogy: 'Dê UMA analogia curta e memorável para este card.',
    mnemonic: 'Dê um gancho de memória (mnemônico) curto para lembrar deste card.',
  };
  const system =
    'You help a student reviewing a flashcard. ' +
    `Front: ${front}. Back: ${back}. ` +
    'Answer in Brazilian Portuguese, in at most 3 short sentences. Be concrete and concise. ' +
    'Plain text only: no markdown, no headings, no preamble.';
  return createMessage({ system, messages: [{ role: 'user', content: ASK[action] }], maxTokens: 400 });
}
