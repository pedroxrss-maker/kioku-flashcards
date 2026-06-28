/**
 * Banco de provas — cliente da geração de flashcards por IA (endpoint SSE do
 * ai-proxy: POST /banco-provas). Cliente FINO: toda a lógica pesada (ler questões,
 * batches, dedupe, prompts) roda no Worker; aqui só abrimos o stream, repassamos o
 * progresso e devolvemos os cards.
 *
 * Auth igual aos outros chamados de IA: o JWT do Supabase vai no header
 * Authorization (ver getAccessToken em features/ai/client.ts). Cota: se o Worker
 * recusar com 429 (quota_exceeded) ANTES do stream, lançamos QuotaError para o
 * fluxo de upsell existente (openUpgrade) reagir, igual à geração normal de deck.
 */
import { getFreshAccessToken, refreshAccessToken } from '../../lib/supabase';
import { AiError, QuotaError } from '../ai/client';

export interface BancoProgress {
  batch: number;
  totalBatches: number;
  cardsSoFar: number;
}

export interface BancoGenCard {
  front: string;
  back: string;
}

export interface BancoGenRequest {
  vestibular: string;
  disciplina: string;
  topico: string;
  /** Opcional: força um modelo específico (default decidido pelo Worker). */
  model?: string;
}

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL as string | undefined;

/** Mensagem amigável (pt-BR) para um `reason` vindo do evento SSE de erro. */
function friendlyReason(reason: string): string {
  switch (reason) {
    case 'no_questions':
      return 'Nenhuma questão encontrada para este tópico ainda.';
    case 'no_cards':
      return 'Não foi possível gerar flashcards reutilizáveis para este tópico. As questões dependiam muito do texto original. Tente outro tópico.';
    case 'overloaded':
      return 'A IA está sobrecarregada agora. Tente novamente em instantes.';
    case 'network':
    case 'ai_unreachable':
      return 'Falha de conexão com a IA. Verifique sua internet e tente de novo.';
    default:
      return 'Não foi possível gerar os flashcards. Tente novamente.';
  }
}

/** Trata uma resposta NÃO-ok (vem como JSON antes do stream): 429 -> QuotaError
 *  (com metric/used/limit/period) para o upsell; senão um AiError genérico. */
async function throwForErrorResponse(res: Response): Promise<never> {
  let body:
    | { error?: string; code?: string; metric?: string; period?: string; used?: number; max_count?: number }
    | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* corpo não-JSON */
  }
  if (res.status === 429 || body?.code === 'quota_exceeded') {
    throw new QuotaError(
      'Limite de gerações de deck por IA atingido. Faça upgrade do plano para gerar mais.',
      {
        metric: body?.metric ?? 'deckGen',
        used: body?.used ?? 0,
        limit: body?.max_count ?? 0,
        period: body?.period ?? 'day',
      },
    );
  }
  throw new AiError(body?.error ?? 'Não foi possível gerar os flashcards. Tente novamente.');
}

/**
 * Gera flashcards de um tópico via o endpoint SSE. Emite progresso por
 * `onProgress`; resolve com a lista de cards no evento `done`. Lança QuotaError
 * (429), ou AiError (rede / 'error' / sem cards).
 */
export async function generateBancoFlashcards(
  req: BancoGenRequest,
  opts?: { onProgress?: (p: BancoProgress) => void },
): Promise<BancoGenCard[]> {
  if (!PROXY_URL) throw new AiError('IA não configurada (defina VITE_AI_PROXY_URL).');
  // Token FRESCO (refresca proativamente se perto de expirar) — uma geração roda
  // por dezenas de segundos, então um token quase-expirado falharia no servidor.
  const token = await getFreshAccessToken();
  if (!token) throw new AiError('Faça login para usar a IA.');

  const url = PROXY_URL.replace(/\/+$/, '') + '/banco-provas';
  const post = (jwt: string): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        vestibular: req.vestibular,
        disciplina: req.disciplina,
        topico: req.topico,
        ...(req.model ? { model: req.model } : {}),
      }),
    });

  let res: Response;
  try {
    res = await post(token);
  } catch {
    throw new AiError('Falha de conexão com a IA. Verifique sua internet ou o proxy configurado.');
  }

  // RETRY-ÚNICO em rejeição de auth (401): o Worker valida o JWT ANTES de consumir
  // cota e ANTES de abrir o stream, então um 401 sempre acontece na entrada — nunca
  // no meio da geração. Logo, refrescar e tentar de novo NÃO duplica cota nem
  // trabalho. Só depois disso é que o usuário veria "sessão expirada".
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      try {
        res = await post(refreshed);
      } catch {
        throw new AiError('Falha de conexão com a IA. Verifique sua internet ou o proxy configurado.');
      }
    }
  }

  // Cota/erros chegam como JSON ANTES do stream — checa o status primeiro.
  if (!res.ok) await throwForErrorResponse(res);
  if (!res.body) throw new AiError('A IA não retornou conteúdo. Tente novamente.');

  // Leitor SSE event-aware (o reader do tutor só trata `data:`; aqui há eventos
  // nomeados). Acumula linhas até a linha em branco, então despacha o evento.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let evName = '';
  let dataStr = '';
  let result: BancoGenCard[] | null = null;
  let failedReason: string | null = null;

  const dispatch = () => {
    if (!evName && !dataStr) return;
    let data: unknown;
    if (dataStr) {
      try {
        data = JSON.parse(dataStr);
      } catch {
        data = undefined;
      }
    }
    if (evName === 'progress' && data) {
      opts?.onProgress?.(data as BancoProgress);
    } else if (evName === 'done') {
      result = ((data as { cards?: BancoGenCard[] } | undefined)?.cards ?? []) as BancoGenCard[];
    } else if (evName === 'error') {
      failedReason = (data as { reason?: string } | undefined)?.reason ?? 'error';
    }
    evName = '';
    dataStr = '';
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line === '') {
        dispatch(); // linha em branco encerra um evento
        continue;
      }
      if (line.startsWith(':')) continue; // comentário (flush inicial ":\n\n")
      if (line.startsWith('event:')) evName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataStr += (dataStr ? '\n' : '') + line.slice(5).trim();
    }
    if (failedReason || result) break; // terminou (erro ou done)
  }
  dispatch(); // despacha um evento final sem '\n' à direita

  if (failedReason) throw new AiError(friendlyReason(failedReason));
  if (!result) throw new AiError('A geração não retornou cards. Tente novamente.');
  return result;
}
