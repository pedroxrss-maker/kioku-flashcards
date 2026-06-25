/**
 * Kioku AI proxy (Cloudflare Worker).
 *
 * Guarda a chave da API do Google Gemini no servidor e expoe um endpoint simples
 * para o app Kioku:
 *   POST /  { model, metric, contents, systemInstruction?, generationConfig }
 *           -> valida o usuario, aplica o limite de uso e repassa a resposta
 *              JSON do Gemini (candidates[...]) sem alterar
 *
 * SEGURANCA (Etapa 2): cada requisicao traz o JWT do Supabase do usuario
 * (Authorization: Bearer <token>). O Worker:
 *   1. valida a assinatura do JWT contra as chaves PUBLICAS do Supabase (JWKS,
 *      ES256/ECC), com cache em memoria - sem bater no Supabase a cada request;
 *   2. chama a funcao consume_quota(metric, period) como o proprio usuario
 *      (encaminhando o JWT para o endpoint RPC do Supabase, entao auth.uid()
 *      funciona dentro da funcao) para checar+incrementar o uso atomicamente;
 *   3. recusa com 429 quando allowed=false; segue para o Gemini quando true.
 * O periodo (dia/mes) e decidido pela funcao a partir do plano do usuario, nunca
 * pelo cliente.
 *
 * O navegador NUNCA recebe a chave do Gemini. Segredos vem de env (Wrangler
 * secrets; localmente via .dev.vars, ignorado pelo git).
 */

export interface Env {
  /** Wrangler secret: `wrangler secret put GOOGLE_GEMINI_API_KEY`. */
  GOOGLE_GEMINI_API_KEY: string;
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
  /** Supabase: URL do projeto, ex. https://xxxx.supabase.co (secret ou var).
   *  O endpoint JWKS e derivado dela: {URL}/auth/v1/.well-known/jwks.json */
  SUPABASE_URL: string;
  /** Supabase: chave anon (apikey do gateway, usada no JWKS e no RPC). E publica. */
  SUPABASE_ANON_KEY: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Metricas aceitas no corpo. deckGen = geracao de decks; tutor = ajuda de IA na
 *  revisao; image = prompt visual (describeCardVisually) do gerador de imagens. */
const ACCEPTED_METRICS = ['deckGen', 'tutor', 'image'];
/** Dessas, as que CONSOMEM cota aqui. "image" NAO conta no ai-proxy: a imagem e
 *  contada uma unica vez no image-proxy, no momento da geracao real (describe e
 *  gerar sempre acontecem juntos, entao contar nos dois seria contagem dupla). */
const METERED_METRICS = ['deckGen', 'tutor'];

/**
 * Teto de cartas por deck gerado por IA, por plano. ESPELHA `AI_DECK_MAX_CARDS`
 * em src/features/usage/limits.ts - mantenha os dois em sincronia. free = 10;
 * Basico = 150; Avancado = 300. Este e o teto REAL, aplicado no servidor (corta
 * a resposta do Gemini); o cliente so limita o seletor visualmente.
 */
const AI_DECK_MAX_CARDS: Record<string, number> = { free: 10, basic: 150, advanced: 300 };
const maxCardsForPlan = (plan: string): number =>
  AI_DECK_MAX_CARDS[plan] ?? AI_DECK_MAX_CARDS.free;

interface GenerateBody {
  model?: string;
  metric?: string;
  contents?: unknown;
  systemInstruction?: unknown;
  generationConfig?: unknown;
}

function parseOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cabecalhos CORS. So devolve Allow-Origin quando a origem esta na lista. */
function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && parseOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// ── JWT (ES256 / JWKS) verification ──────────────────────────────────────────
// Este projeto usa chaves de assinatura ASSIMETRICAS (ECC P-256 -> ES256). O
// Worker busca as chaves PUBLICAS no endpoint JWKS do Supabase e valida a
// assinatura localmente, escolhendo a chave pelo `kid` do header do JWT. O JWKS
// fica em cache na memoria do Worker (TTL curto) e e refeito quando o `kid` nao
// e encontrado (cobre rotacao de chaves). Nenhum segredo de assinatura e
// necessario - so a URL do projeto (de onde sai o JWKS) e a anon key (apikey).

function base64UrlToBytes(input: string): Uint8Array {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const bin = atob(s + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(seg: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(seg)));
}

/** A standalone ArrayBuffer view of bytes (a BufferSource Web Crypto accepts). */
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function utf8(s: string): ArrayBuffer {
  return buf(new TextEncoder().encode(s));
}

interface JwtClaims {
  sub: string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}

// Cache do JWKS em memoria do isolate (compartilhado entre requisicoes).
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000; // 10 min

function jwksUrl(env: Env): string {
  return `${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
}

async function fetchJwks(env: Env): Promise<Jwk[] | null> {
  try {
    const res = await fetch(jwksUrl(env), { headers: { apikey: env.SUPABASE_ANON_KEY } });
    if (!res.ok) return null;
    const data = (await res.json()) as { keys?: Jwk[] };
    if (!Array.isArray(data.keys)) return null;
    jwksCache = { keys: data.keys, fetchedAt: Date.now() };
    return data.keys;
  } catch {
    return null;
  }
}

/** Chaves do JWKS: usa o cache se fresco; senao busca. Em falha de rede, cai no
 *  cache antigo se existir. forceRefresh ignora o cache (usado na rotacao). */
async function getJwks(env: Env, forceRefresh: boolean): Promise<Jwk[] | null> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (jwksCache && fresh && !forceRefresh) return jwksCache.keys;
  const keys = await fetchJwks(env);
  if (keys) return keys;
  return jwksCache ? jwksCache.keys : null; // fallback ao cache antigo
}

/** Acha a chave EC pelo kid. Se nao achar (kid novo apos rotacao), refaz 1 vez. */
async function findVerifyKey(env: Env, kid: string | undefined): Promise<Jwk | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const keys = await getJwks(env, attempt === 1);
    if (!keys) return null;
    const key = keys.find((k) => k.kty === 'EC' && (!kid || k.kid === kid));
    if (key) return key;
  }
  return null;
}

/** Verifica assinatura ES256 (via JWKS) + exp/nbf/aud/sub. Claims ou null. */
async function verifySupabaseJwt(token: string, env: Env): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJsonSegment(headerB64);
    payload = decodeJsonSegment(payloadB64);
  } catch {
    return null;
  }
  if (header.alg !== 'ES256') return null;

  const jwk = await findVerifyKey(env, typeof header.kid === 'string' ? header.kid : undefined);
  if (!jwk || !jwk.x || !jwk.y) return null;

  let ok = false;
  try {
    // Importa so os campos da chave publica EC (evita conflito com use/key_ops/alg).
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: jwk.crv ?? 'P-256', x: jwk.x, y: jwk.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    // A assinatura JWS ES256 ja vem como r||s cru (P1363), que e o que o
    // WebCrypto ECDSA verify espera.
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      buf(base64UrlToBytes(sigB64)),
      utf8(`${headerB64}.${payloadB64}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now) return null;
  if (payload.aud && payload.aud !== 'authenticated') return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  return { sub: payload.sub };
}

// ── Quota ────────────────────────────────────────────────────────────────────
interface QuotaRow {
  allowed: boolean;
  used: number;
  max_count: number;
  /** A funcao consume_quota expoe a coluna de saida como "period_out". */
  period_out: string;
}

/**
 * Chama consume_quota como o proprio usuario, encaminhando o JWT ao endpoint RPC
 * do Supabase (apikey = anon). Assim auth.uid() dentro da funcao = o usuario, e a
 * funcao decide o periodo pelo plano (p_period e ignorado, mandamos so para
 * casar a assinatura). Retorna a linha ou null se nao deu para checar.
 */
async function consumeQuota(env: Env, userJwt: string, metric: string): Promise<QuotaRow | null> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/consume_quota`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userJwt}`,
      },
      body: JSON.stringify({ p_metric: metric, p_period: 'day' }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let rows: QuotaRow[];
  try {
    rows = (await res.json()) as QuotaRow[];
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

// ── Teto de cartas por deck (deckGen) ────────────────────────────────────────

/**
 * Le o plano do usuario (free | basic | advanced) da tabela profiles via REST,
 * autenticando com o PROPRIO JWT do usuario (a RLS de profiles limita a leitura
 * ao dono, auth.uid() = id). Em QUALQUER falha cai em 'free' (o teto mais
 * restrito), entao nunca libera mais que o permitido. Usado so no deckGen.
 */
async function fetchUserPlan(env: Env, userJwt: string, uid: string): Promise<string> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const url = `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=plan&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${userJwt}` },
    });
    if (!res.ok) return 'free';
    const rows = (await res.json()) as Array<{ plan?: string }>;
    const plan = Array.isArray(rows) && typeof rows[0]?.plan === 'string' ? rows[0].plan : 'free';
    return plan === 'basic' || plan === 'advanced' ? plan : 'free';
  } catch {
    return 'free';
  }
}

/**
 * Anexa ao systemInstruction um limite DURO de cartas (lado do pedido): instrui o
 * Gemini a nunca produzir mais que `maxCards`, mesmo que a instrucao do usuario
 * peca mais. E so um "steer" (reduz desperdicio de tokens); a garantia real e o
 * corte da resposta em capDeckCardsResponse.
 */
function withCardCapInstruction(systemInstruction: unknown, maxCards: number): unknown {
  const note =
    `HARD SERVER LIMIT: output AT MOST ${maxCards} flashcards in the JSON array, regardless of any ` +
    `other instruction or requested count. If more are requested, include only the first ${maxCards}.`;
  if (systemInstruction && typeof systemInstruction === 'object') {
    const si = systemInstruction as { parts?: Array<{ text?: string }> };
    const parts = Array.isArray(si.parts) ? [...si.parts] : [];
    parts.push({ text: note });
    return { ...si, parts };
  }
  return { parts: [{ text: note }] };
}

/**
 * Corta o array de cartas da resposta do Gemini ao teto do plano (lado da
 * resposta = garantia real). Le o texto de candidates[0].content.parts, isola o
 * array JSON (do primeiro "[" ao ultimo "]"), e se tiver mais que `maxCards`
 * troca por um array cortado e re-serializado. Em qualquer formato inesperado
 * (sem array, JSON invalido, dentro do teto) devolve a resposta INTACTA, entao
 * nunca quebra o fluxo do cliente.
 */
export function capDeckCardsResponse(data: unknown, maxCards: number): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const cand = d.candidates?.[0];
  const parts = cand?.content?.parts;
  if (!cand || !Array.isArray(parts)) return data;

  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('\n');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < 0 || end < start) return data; // nao e um array: deixa como veio

  let arr: unknown;
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return data; // JSON invalido: o cliente trata o erro
  }
  if (!Array.isArray(arr) || arr.length <= maxCards) return data; // dentro do teto: intacto

  const newText = JSON.stringify(arr.slice(0, maxCards));
  cand.content = { ...(cand.content ?? {}), parts: [{ text: newText }] };
  return d;
}

// ── Retry + fallback de modelos para falhas transitórias do Gemini ───────────
// O Gemini pode responder 503 (UNAVAILABLE / sobrecarga) ou 429 (rate limit por
// minuto na NOSSA chave compartilhada). Ambos são transitórios e de
// INFRAESTRUTURA — nada a ver com a cota do plano do usuário. Em vez de só
// retentar UM modelo, percorremos uma CADEIA ordenada de modelos: esgotadas as
// retentativas do modelo atual por 503/429 (ou rede), caímos para o próximo
// modelo da cadeia. Só quando a cadeia INTEIRA se esgota devolvemos um
// error_code estruturado NOSSO (ai_overloaded) — nunca o texto cru do Google.
//
// A cota do plano (429 nosso, quota_exceeded) é tratada ANTES disto, no handler,
// e NUNCA passa por aqui: o fallback se aplica só à sobrecarga do lado do Google.
const MODEL_FALLBACK_CHAIN = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const MAX_GEMINI_ATTEMPTS = 4; // por modelo
const GEMINI_BACKOFFS_MS = [300, 800, 1500]; // espera após a 1ª, 2ª, 3ª falha (4 tentativas)
// Teto para o retryDelay sugerido pelo Google: respeitamos a dica, mas limitada,
// para nunca pendurar a requisição do usuário por dezenas de segundos.
const MAX_RETRY_DELAY_MS = 8000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Jitter aleatório (0–250ms) para não sincronizar as retentativas. */
const withJitter = (ms: number): number => ms + Math.floor(Math.random() * 250);

/**
 * Constrói a cadeia ordenada de modelos a tentar: o modelo PREFERIDO do cliente
 * primeiro, seguido dos fallbacks padrão (sem duplicar). Se o modelo do cliente
 * já estiver na cadeia, ele só é promovido para a frente; se não estiver, vira o
 * primário e a cadeia inteira é anexada depois dele.
 */
export function buildModelChain(primary: string): string[] {
  const chain: string[] = [primary];
  for (const m of MODEL_FALLBACK_CHAIN) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

/** Lê o RetryInfo.retryDelay ("57s", "1.5s") do corpo de um 429 do Google, em ms. */
async function googleRetryDelayMs(res: Response): Promise<number | null> {
  let body: { error?: { details?: Array<{ retryDelay?: unknown }> } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }
  const details = body?.error?.details;
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    const raw = typeof d?.retryDelay === 'string' ? d.retryDelay.trim() : '';
    const m = /^([\d.]+)s$/.exec(raw);
    if (m) {
      const secs = Number.parseFloat(m[1]);
      if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
    }
  }
  return null;
}

type GeminiOutcome =
  | { kind: 'ok'; data: unknown }
  | { kind: 'overloaded' } // 503 / 429 do Google após esgotar a CADEIA inteira
  | { kind: 'error' } // erro real do Google (400/401/403/...): falha rápida
  | { kind: 'network' }; // o fetch lançou (rede/timeout) em todos os modelos

/** Dependências injetáveis (testes passam um fetch falso e um sleep instantâneo);
 *  em produção, usam o fetch e o sleep reais. */
interface GeminiCallDeps {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Chama UM modelo via generateContent com retry-com-backoff. Repete SOMENTE em
 * 503 e 429 (sobrecarga / rate limit do Google na chave compartilhada), até
 * MAX_GEMINI_ATTEMPTS. NUNCA repete 400/401/403/404 — são erros reais, falha
 * rápida. Em 429 respeita o retryDelay sugerido pelo Google quando presente.
 * Devolve 'overloaded' (503/429 esgotados) ou 'network' (fetch lançou em todas
 * as tentativas) para o orquestrador decidir cair para o próximo modelo.
 */
async function callGeminiWithRetry(
  model: string,
  geminiBody: unknown,
  apiKey: string,
  deps: GeminiCallDeps = {},
): Promise<GeminiOutcome> {
  const doFetch = deps.fetchImpl ?? fetch;
  const doSleep = deps.sleepImpl ?? sleep;
  const endpoint = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
  for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS; attempt += 1) {
    const last = attempt === MAX_GEMINI_ATTEMPTS - 1;
    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(geminiBody),
      });
    } catch {
      if (last) return { kind: 'network' };
      await doSleep(withJitter(GEMINI_BACKOFFS_MS[attempt]));
      continue;
    }

    if (res.ok) {
      try {
        return { kind: 'ok', data: await res.json() };
      } catch {
        return { kind: 'error' };
      }
    }

    // Só 503 e 429 são transitórios (sobrecarga). Os demais são erros reais.
    if (res.status !== 503 && res.status !== 429) {
      return { kind: 'error' };
    }
    if (last) return { kind: 'overloaded' };

    let delay = GEMINI_BACKOFFS_MS[attempt];
    if (res.status === 429) {
      const hinted = await googleRetryDelayMs(res);
      if (hinted != null) delay = Math.min(hinted, MAX_RETRY_DELAY_MS);
    }
    await doSleep(withJitter(delay));
  }
  return { kind: 'overloaded' };
}

/**
 * Percorre a cadeia de modelos: tenta cada um (com retry). Em sobrecarga do
 * Google (503/429 esgotados) ou falha de rede, cai para o PRÓXIMO modelo. Volta
 * no primeiro 200 (ok) ou num erro REAL do Google (falha rápida — 400/4xx falha
 * igual em todos os modelos, não adianta insistir). Só quando a cadeia INTEIRA
 * se esgota é que devolvemos 'overloaded' (ou 'network', se nunca falamos com o
 * Google em nenhum modelo).
 */
export async function callGeminiWithFallback(
  models: string[],
  geminiBody: unknown,
  apiKey: string,
  deps: GeminiCallDeps = {},
): Promise<GeminiOutcome> {
  let sawOverloaded = false;
  let sawNetwork = false;
  for (const model of models) {
    const outcome = await callGeminiWithRetry(model, geminiBody, apiKey, deps);
    if (outcome.kind === 'ok' || outcome.kind === 'error') return outcome;
    if (outcome.kind === 'overloaded') sawOverloaded = true;
    else sawNetwork = true;
    // 'overloaded' | 'network': cai para o próximo modelo da cadeia.
  }
  // Cadeia esgotada: preferimos 'overloaded' (caso esperado) sobre 'network'.
  if (sawOverloaded) return { kind: 'overloaded' };
  if (sawNetwork) return { kind: 'network' };
  return { kind: 'overloaded' }; // defensivo (cadeia vazia)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    // Preflight CORS.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Se uma origem foi enviada e nao esta liberada, bloqueia.
    if (origin && !cors['Access-Control-Allow-Origin']) {
      return json({ error: 'Origem não permitida.' }, 403, cors);
    }

    // POST / : valida usuario, aplica limite e repassa a geracao para o Gemini.
    if (request.method === 'POST' && url.pathname === '/') {
      if (!env.GOOGLE_GEMINI_API_KEY) {
        return json({ error: 'Chave da IA não configurada no servidor.' }, 500, cors);
      }
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return json({ error: 'Autenticação não configurada no servidor.' }, 500, cors);
      }

      let body: GenerateBody;
      try {
        body = (await request.json()) as GenerateBody;
      } catch {
        return json({ error: 'Corpo JSON inválido.' }, 400, cors);
      }

      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (!model || !body.contents) {
        return json({ error: 'Parâmetros obrigatórios: model, contents.' }, 400, cors);
      }

      // 1) Autenticacao: JWT do Supabase, validado localmente (sem rede).
      const authHeader = request.headers.get('Authorization') ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return json({ error: 'Não autenticado.', code: 'unauthenticated' }, 401, cors);
      }
      const claims = await verifySupabaseJwt(token, env);
      if (!claims) {
        return json(
          { error: 'Sessão inválida ou expirada. Entre novamente.', code: 'unauthenticated' },
          401,
          cors,
        );
      }

      // 2) Metrica obrigatoria e conhecida.
      const metric = typeof body.metric === 'string' ? body.metric : '';
      if (!ACCEPTED_METRICS.includes(metric)) {
        return json({ error: 'Métrica inválida.' }, 400, cors);
      }

      // 3) Limite de uso (atomico, no Postgres). O periodo vem do plano.
      //    "image" (describeCardVisually) NAO consome cota aqui: a imagem e
      //    contada so no image-proxy, na geracao real. Esse passo so autentica.
      if (METERED_METRICS.includes(metric)) {
        const quota = await consumeQuota(env, token, metric);
        if (!quota) {
          return json(
            {
              error: 'Não foi possível verificar seu limite de uso. Tente novamente.',
              code: 'quota_unavailable',
              error_code: 'quota_unavailable',
            },
            503,
            cors,
          );
        }
        if (!quota.allowed) {
          // 429 da NOSSA checagem de cota (limite do plano). É um erro de COTA
          // real — o cliente DEVE manter o paywall/UpgradeModal aqui. Não confunda
          // com o 429/503 de sobrecarga do Google (ai_overloaded), que nunca abre
          // o paywall.
          return json(
            {
              error: 'Limite de uso atingido.',
              code: 'quota_exceeded',
              error_code: 'quota_exceeded',
              metric,
              period: quota.period_out,
              used: quota.used,
              max_count: quota.max_count,
            },
            429,
            cors,
          );
        }
      }

      // 3b) Geracao de deck: o teto de cartas por deck depende do plano (free=20,
      //     pagos=100). Lido do profiles via REST com o JWT do usuario (RLS limita
      //     ao dono). E o teto REAL: o cliente pode ser adulterado, aqui nao.
      let deckMaxCards = 0;
      if (metric === 'deckGen') {
        const plan = await fetchUserPlan(env, token, claims.sub);
        deckMaxCards = maxCardsForPlan(plan);
      }

      // A chave vai no cabecalho x-goog-api-key (fora da URL e dos logs). O `model`
      // vai na URL; o corpo repassado ao Google e so o do Gemini (sem `model`/`metric`).
      const geminiBody: Record<string, unknown> = { contents: body.contents };
      if (body.systemInstruction !== undefined) geminiBody.systemInstruction = body.systemInstruction;
      if (body.generationConfig !== undefined) geminiBody.generationConfig = body.generationConfig;
      // deckGen: injeta o teto duro de cartas no pedido (steer do Gemini; a
      // garantia real e o corte da resposta logo abaixo).
      if (metric === 'deckGen') {
        geminiBody.systemInstruction = withCardCapInstruction(geminiBody.systemInstruction, deckMaxCards);
      }

      // Chama o Gemini com retry-com-backoff E fallback de modelos em falhas
      // transitórias (503/429 do Google). O `model` do cliente é o PREFERIDO
      // (primeiro da cadeia); o Worker é dono da cadeia de fallback. NUNCA
      // repassa o texto cru do Google: ao falhar, devolve só o nosso error_code.
      const models = buildModelChain(model);
      const outcome = await callGeminiWithFallback(models, geminiBody, env.GOOGLE_GEMINI_API_KEY);

      if (outcome.kind === 'network') {
        // Nem chegamos a falar com o Google (rede/timeout).
        return json(
          { error: 'Falha ao falar com a IA. Tente novamente.', error_code: 'ai_unreachable' },
          502,
          cors,
        );
      }
      if (outcome.kind === 'overloaded') {
        // 503 / 429 do Google após as retentativas: SOBRECARGA de infraestrutura
        // (a chave compartilhada/o modelo está congestionado). NÃO é o limite do
        // plano do usuário — o cliente mostra um aviso amigável e JAMAIS abre o
        // paywall por isso. Nunca vaza o texto cru do Google.
        return json(
          { error: 'A IA está sobrecarregada. Tente novamente em instantes.', error_code: 'ai_overloaded' },
          503,
          cors,
        );
      }
      if (outcome.kind === 'error') {
        // Erro real do Google (400/401/403/404...): falha rápida, com mensagem
        // genérica NOSSA — sem repassar o texto do Google.
        return json(
          { error: 'A IA não conseguiu processar a solicitação.', error_code: 'ai_error' },
          502,
          cors,
        );
      }

      // Repassa o JSON do Gemini. Em deckGen, CORTA o array de cartas ao teto do
      // plano (garantia real, mesmo que o cliente peca 50 ou o Gemini exagere).
      const out = metric === 'deckGen' ? capDeckCardsResponse(outcome.data, deckMaxCards) : outcome.data;
      return json(out, 200, cors);
    }

    return json({ error: 'Não encontrado.' }, 404, cors);
  },
};
