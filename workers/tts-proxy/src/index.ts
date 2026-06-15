/**
 * Kioku TTS proxy (Cloudflare Worker).
 *
 * Guarda a credencial do Google Cloud Text-to-Speech no servidor e expoe
 * endpoints simples para o app Kioku:
 *   POST /synthesize  { text, voiceName, languageCode, audioEncoding }
 *                     -> { audioContent }   (base64, igual a REST do Google)
 *   GET  /voices      -> { voices: [...] }  (lista curada; trocavel por proxy)
 *
 * O navegador NUNCA recebe a credencial. NUNCA cometa segredos: a chave vem de
 * env.GOOGLE_TTS_API_KEY (Wrangler secret; localmente via .dev.vars, ignorado
 * pelo git). Veja o README para a opcao com service account + OAuth.
 *
 * AUTENTICACAO + COTA (mesma abordagem do ai-proxy/image-proxy): /synthesize
 * exige o JWT do Supabase do usuario (Authorization: Bearer <token>), validado
 * por assinatura contra o JWKS publico (ES256/ECC), e chama consume_quota com a
 * metrica "audio". O plano gratuito tem teto mensal de audios; os planos pagos
 * sao ilimitados (a funcao decide pelo plano, entao para os pagos ela libera sem
 * medir). 429 quando o limite estoura, 503 fail-closed quando nao da para checar.
 */

export interface Env {
  /** Wrangler secret: `wrangler secret put GOOGLE_TTS_API_KEY`. */
  GOOGLE_TTS_API_KEY: string;
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
  /** Supabase: URL do projeto, ex. https://xxxx.supabase.co (secret ou var).
   *  O endpoint JWKS e derivado dela: {URL}/auth/v1/.well-known/jwks.json */
  SUPABASE_URL: string;
  /** Supabase: publishable key (sb_publishable_...), usada como apikey no JWKS/RPC. */
  SUPABASE_ANON_KEY: string;
}

const GOOGLE_TTS = 'https://texttospeech.googleapis.com/v1';

/** Metrica de cota da geracao de audio (igual a quota_rules no banco). */
const AUDIO_METRIC = 'audio';

interface SynthesizeBody {
  text?: string;
  voiceName?: string;
  languageCode?: string;
  audioEncoding?: 'MP3' | 'OGG_OPUS' | 'LINEAR16';
  /** "Testar voz": gera a previa SEM consumir cota (mas ainda exige JWT). */
  preview?: boolean;
}

/**
 * Lista curada que espelha a do app (googleProvider.ts). Pode ser trocada por
 * um proxy real de `${GOOGLE_TTS}/voices?key=...&languageCode=...`.
 */
const CURATED_VOICES = [
  { id: 'en-US-Neural2-D', name: 'Inglês (EUA), masculina (D)', lang: 'en-US' },
  { id: 'en-US-Neural2-J', name: 'Inglês (EUA), masculina (J)', lang: 'en-US' },
  { id: 'en-US-Neural2-C', name: 'Inglês (EUA), feminina (C)', lang: 'en-US' },
  { id: 'en-US-Neural2-F', name: 'Inglês (EUA), feminina (F)', lang: 'en-US' },
  { id: 'pt-BR-Neural2-B', name: 'Português (BR), masculina (B)', lang: 'pt-BR' },
  { id: 'pt-BR-Neural2-A', name: 'Português (BR), feminina (A)', lang: 'pt-BR' },
  { id: 'pt-BR-Neural2-C', name: 'Português (BR), feminina (C)', lang: 'pt-BR' },
];

function parseOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cabecalhos CORS. So devolve Allow-Origin quando a origem esta na lista. */
function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
// Mesma abordagem do ai-proxy: o projeto usa chaves ASSIMETRICAS (ECC P-256 ->
// ES256). Buscamos as chaves PUBLICAS no JWKS do Supabase e validamos a
// assinatura localmente, escolhendo a chave pelo `kid`. O JWKS fica em cache na
// memoria do Worker (TTL curto) e e refeito quando o `kid` nao e encontrado
// (rotacao). Nenhum segredo de assinatura e necessario - so a URL do projeto e
// a publishable key (apikey). SEM cota: este Worker apenas autentica.

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

/** Resultado: ok | invalido (-> 401) | indisponivel/JWKS fora do ar (-> 503). */
type VerifyOutcome = { ok: true; claims: JwtClaims } | { ok: false; unavailable: boolean };

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

/** Acha a chave EC pelo kid. `unavailable` = nao deu para obter o JWKS (rede);
 *  key=null com unavailable=false = JWKS ok, mas sem chave para esse kid. */
async function findVerifyKey(
  env: Env,
  kid: string | undefined,
): Promise<{ key: Jwk | null; unavailable: boolean }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const keys = await getJwks(env, attempt === 1);
    if (!keys) return { key: null, unavailable: true };
    const key = keys.find((k) => k.kty === 'EC' && (!kid || k.kid === kid));
    if (key) return { key, unavailable: false };
  }
  return { key: null, unavailable: false };
}

/** Verifica assinatura ES256 (via JWKS) + exp/nbf/aud/sub. */
async function verifySupabaseJwt(token: string, env: Env): Promise<VerifyOutcome> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, unavailable: false };
  const [headerB64, payloadB64, sigB64] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJsonSegment(headerB64);
    payload = decodeJsonSegment(payloadB64);
  } catch {
    return { ok: false, unavailable: false };
  }
  if (header.alg !== 'ES256') return { ok: false, unavailable: false };

  const found = await findVerifyKey(env, typeof header.kid === 'string' ? header.kid : undefined);
  if (found.unavailable) return { ok: false, unavailable: true };
  const jwk = found.key;
  if (!jwk || !jwk.x || !jwk.y) return { ok: false, unavailable: false };

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
    return { ok: false, unavailable: false };
  }
  if (!ok) return { ok: false, unavailable: false };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return { ok: false, unavailable: false };
  if (typeof payload.nbf === 'number' && payload.nbf > now) return { ok: false, unavailable: false };
  if (payload.aud && payload.aud !== 'authenticated') return { ok: false, unavailable: false };
  if (typeof payload.sub !== 'string' || !payload.sub) return { ok: false, unavailable: false };
  return { ok: true, claims: { sub: payload.sub } };
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
 * do Supabase (apikey = anon). auth.uid() dentro da funcao = o usuario, e a
 * funcao decide o periodo/teto pelo plano. Retorna a linha ou null se nao deu
 * para checar (o handler trata null como 503 fail-closed).
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

    // GET /voices (opcional): lista curada para o seletor.
    if (request.method === 'GET' && url.pathname === '/voices') {
      return json({ voices: CURATED_VOICES }, 200, cors);
    }

    // POST /synthesize: gera o audio no Google e devolve { audioContent }.
    if (request.method === 'POST' && url.pathname === '/synthesize') {
      if (!env.GOOGLE_TTS_API_KEY) {
        return json({ error: 'Credencial do Google não configurada no servidor.' }, 500, cors);
      }
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return json({ error: 'Autenticação não configurada no servidor.' }, 500, cors);
      }

      // Autenticacao do usuario. JWT do Supabase validado por assinatura
      // (ES256/JWKS). 401 se faltar/for invalido; 503 fail-closed se nao deu
      // para validar (JWKS fora do ar). A cota de audio e aplicada mais abaixo.
      const authHeader = request.headers.get('Authorization') ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) {
        return json({ error: 'Não autenticado.', code: 'unauthenticated' }, 401, cors);
      }
      const verified = await verifySupabaseJwt(token, env);
      if (!verified.ok) {
        if (verified.unavailable) {
          return json(
            { error: 'Não foi possível validar sua sessão agora. Tente novamente.', code: 'auth_unavailable' },
            503,
            cors,
          );
        }
        return json(
          { error: 'Sessão inválida ou expirada. Entre novamente.', code: 'unauthenticated' },
          401,
          cors,
        );
      }

      let body: SynthesizeBody;
      try {
        body = (await request.json()) as SynthesizeBody;
      } catch {
        return json({ error: 'Corpo JSON inválido.' }, 400, cors);
      }

      const text = (body.text ?? '').trim();
      const voiceName = (body.voiceName ?? '').trim();
      const languageCode = (body.languageCode ?? '').trim();
      const audioEncoding = body.audioEncoding ?? 'MP3';
      if (!text || !voiceName || !languageCode) {
        return json(
          { error: 'Parâmetros obrigatórios: text, voiceName, languageCode.' },
          400,
          cors,
        );
      }

      // Cota de audio: gratuito tem teto mensal; pagos sao ilimitados (a funcao
      // consume_quota decide pelo plano). 429 se estourou, 503 se nao deu p/ checar.
      // Previa ("Testar voz") NAO consome cota — mas o JWT ja foi exigido acima,
      // entao isso so pula a medicao, nunca a autenticacao.
      if (body.preview !== true) {
        const quota = await consumeQuota(env, token, AUDIO_METRIC);
        if (!quota) {
          return json(
            { error: 'Não foi possível verificar seu limite de uso. Tente novamente.', code: 'quota_unavailable' },
            503,
            cors,
          );
        }
        if (!quota.allowed) {
          return json(
            {
              error: 'Limite de uso atingido.',
              code: 'quota_exceeded',
              metric: AUDIO_METRIC,
              period: quota.period_out,
              used: quota.used,
              max_count: quota.max_count,
            },
            429,
            cors,
          );
        }
      }

      // Opcao (a), implementada aqui: API key por query string (mais simples).
      // Veja o README para a opcao (b) com service account + token OAuth.
      let googleRes: Response;
      try {
        googleRes = await fetch(`${GOOGLE_TTS}/text:synthesize?key=${env.GOOGLE_TTS_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode, name: voiceName },
            audioConfig: { audioEncoding },
          }),
        });
      } catch {
        return json({ error: 'Falha ao falar com o Google. Tente novamente.' }, 502, cors);
      }

      if (!googleRes.ok) {
        let detail = `Erro do Google (HTTP ${googleRes.status}).`;
        try {
          const err = (await googleRes.json()) as { error?: { message?: string } };
          if (err.error?.message) detail = err.error.message;
        } catch {
          /* resposta nao-JSON: mantem o status acima */
        }
        return json({ error: detail }, googleRes.status, cors);
      }

      const data = (await googleRes.json()) as { audioContent?: string };
      return json({ audioContent: data.audioContent ?? '' }, 200, cors);
    }

    return json({ error: 'Não encontrado.' }, 404, cors);
  },
};
