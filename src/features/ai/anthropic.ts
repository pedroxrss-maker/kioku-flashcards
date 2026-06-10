/**
 * Single choke point for ALL Anthropic calls in the app.
 *
 * SECURITY: a key read from import.meta.env.VITE_ANTHROPIC_API_KEY is bundled
 * into the client JS and is publicly visible, so DIRECT-KEY MODE IS FOR LOCAL /
 * PRIVATE TESTING ONLY. In production set VITE_AI_PROXY_URL to a Cloudflare
 * Worker that holds the key server-side and forwards to the Anthropic API; the
 * browser then sends no key at all. Adding that Worker later needs NO UI or
 * call-site changes, only the env var. If neither var is set, calls throw an
 * AiError with a clear pt-BR setup message (they never crash the app).
 *
 * The Worker should accept the same POST body this module sends and proxy it to
 * https://api.anthropic.com/v1/messages, adding the x-api-key and
 * anthropic-version headers on the server side.
 */
import { buildGeneratePrompt, parseCardsJson } from './cards';
import type { GeneratedCard, GenerateRequest } from './cards';

/** The model to use for all generation and tutoring. */
export const AI_MODEL = 'claude-sonnet-4-20250514';

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL;
const DIRECT_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Carries a user-facing (pt-BR) message; safe to show in dialogs/toasts. */
export class AiError extends Error {}

/** True when either a proxy URL or a direct key is configured. */
export function isAiConfigured(): boolean {
  return Boolean(PROXY_URL || DIRECT_KEY);
}

const NOT_CONFIGURED =
  'IA não configurada. Defina VITE_AI_PROXY_URL (recomendado: um Cloudflare Worker que guarda a ' +
  'chave) ou, apenas para teste local, VITE_ANTHROPIC_API_KEY, e refaça o build.';

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
}

/** Low-level Messages call. Returns the concatenated assistant text. */
async function createMessage({ system, messages, maxTokens = 4096 }: CreateOptions): Promise<string> {
  if (!isAiConfigured()) throw new AiError(NOT_CONFIGURED);

  const body = {
    model: AI_MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  };

  const url = PROXY_URL ? PROXY_URL : ANTHROPIC_URL;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!PROXY_URL) {
    // Direct browser mode (TESTING ONLY): the key is exposed in the bundle.
    headers['x-api-key'] = DIRECT_KEY as string;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
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

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
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
