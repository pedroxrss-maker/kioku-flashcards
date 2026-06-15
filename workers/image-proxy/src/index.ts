/**
 * Kioku image proxy (Cloudflare Worker).
 *
 * Guarda a chave da API da OpenAI no servidor e expoe um endpoint simples para o
 * app Kioku gerar imagens:
 *   POST /  { prompt, size?, quality? }
 *           -> { image }   (PNG em base64, igual ao b64_json da OpenAI)
 *
 * O navegador NUNCA recebe a chave. NUNCA cometa segredos: a chave vem de
 * env.OPENAI_API_KEY (Wrangler secret; localmente via .dev.vars, ignorado pelo
 * git). Usa o modelo gpt-image-1-mini (versao economica do GPT Image 1), que
 * sempre devolve a imagem em base64 (b64_json) — por isso NAO enviamos
 * response_format (parametro nao suportado pelos modelos gpt-image).
 *
 * AUTENTICACAO + COTA (mesma abordagem do ai-proxy): cada requisicao traz o JWT
 * do Supabase do usuario (Authorization: Bearer). O Worker valida a assinatura
 * contra o JWKS publico (ES256/ECC) e chama consume_quota com a metrica "image"
 * (imagem e um recurso pago e limitado): 429 quando estourou o limite, 503
 * fail-closed quando nao deu para verificar. So entao gera a imagem na OpenAI.
 */

export interface Env {
  /** Wrangler secret: `wrangler secret put OPENAI_API_KEY`. */
  OPENAI_API_KEY: string;
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
  /** Supabase: URL do projeto, ex. https://xxxx.supabase.co (secret ou var).
   *  O endpoint JWKS e derivado dela: {URL}/auth/v1/.well-known/jwks.json */
  SUPABASE_URL: string;
  /** Supabase: publishable key (sb_publishable_...), usada como apikey no JWKS/RPC. */
  SUPABASE_ANON_KEY: string;
}

/** Metrica de cota para geracao de imagens (igual a quota_rules no banco). */
const IMAGE_METRIC = 'image';

const OPENAI_IMAGES = 'https://api.openai.com/v1/images/generations';
// Modelo mais barato da familia GPT Image (Mini). Sempre devolve base64.
const MODEL = 'gpt-image-1-mini';
const DEFAULT_SIZE = '1024x1024';
// Tamanhos aceitos pelo gpt-image-1(-mini); qualquer outro vira o padrao.
const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);
const ALLOWED_QUALITIES = new Set(['low', 'medium', 'high', 'auto']);

interface GenerateBody {
  prompt?: string;
  size?: string;
  quality?: string;
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
// Mesma abordagem do ai-proxy: o projeto usa chaves ASSIMETRICAS (ECC P-256 ->
// ES256). Buscamos as chaves PUBLICAS no JWKS do Supabase e validamos a
// assinatura localmente, escolhendo a chave pelo `kid`. O JWKS fica em cache na
// memoria do Worker (TTL curto) e e refeito quando o `kid` nao e encontrado
// (rotacao). Nenhum segredo de assinatura e necessario - so a URL do projeto e
// a publishable key (apikey).

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

    // POST / : valida usuario, aplica a cota e gera a imagem na OpenAI.
    if (request.method === 'POST' && url.pathname === '/') {
      if (!env.OPENAI_API_KEY) {
        return json({ error: 'Chave da OpenAI não configurada no servidor.' }, 500, cors);
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

      const prompt = (body.prompt ?? '').trim();
      if (!prompt) {
        return json({ error: 'Parâmetro obrigatório: prompt.' }, 400, cors);
      }
      const size = body.size && ALLOWED_SIZES.has(body.size) ? body.size : DEFAULT_SIZE;

      // 1) Autenticacao: JWT do Supabase, validado por assinatura (JWKS/ES256).
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

      // 2) Cota de imagens (atomico, no Postgres). O periodo vem do plano.
      const quota = await consumeQuota(env, token, IMAGE_METRIC);
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
            metric: IMAGE_METRIC,
            period: quota.period_out,
            used: quota.used,
            max_count: quota.max_count,
          },
          429,
          cors,
        );
      }

      // gpt-image-1(-mini) sempre devolve base64; `quality` e opcional (low/medium/
      // high/auto). Nao enviamos response_format (nao suportado nesses modelos).
      const openaiBody: Record<string, unknown> = { model: MODEL, prompt, size, n: 1 };
      if (body.quality && ALLOWED_QUALITIES.has(body.quality)) {
        openaiBody.quality = body.quality;
      }

      let openaiRes: Response;
      try {
        openaiRes = await fetch(OPENAI_IMAGES, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(openaiBody),
        });
      } catch {
        return json({ error: 'Falha ao falar com a OpenAI. Tente novamente.' }, 502, cors);
      }

      if (!openaiRes.ok) {
        let detail = `Erro da OpenAI (HTTP ${openaiRes.status}).`;
        try {
          const err = (await openaiRes.json()) as { error?: { message?: string } };
          if (err.error?.message) detail = err.error.message;
        } catch {
          /* resposta nao-JSON: mantem o status acima */
        }
        return json({ error: detail }, openaiRes.status, cors);
      }

      const data = (await openaiRes.json()) as { data?: Array<{ b64_json?: string }> };
      const image = data.data?.[0]?.b64_json ?? '';
      if (!image) {
        return json({ error: 'A OpenAI não retornou nenhuma imagem.' }, 502, cors);
      }
      // PNG em base64 puro (sem o prefixo data:). O cliente monta a URL com
      // `data:image/png;base64,${image}`.
      return json({ image }, 200, cors);
    }

    return json({ error: 'Não encontrado.' }, 404, cors);
  },
};
