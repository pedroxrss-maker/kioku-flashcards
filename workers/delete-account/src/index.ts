/**
 * Kioku delete-account (Cloudflare Worker).
 *
 * Exclui a PRÓPRIA conta do usuário autenticado, de forma IRREVERSÍVEL, usando a
 * SECRET key (service role) para chamar a Auth Admin API do Supabase. Substitui a
 * antiga função SQL delete_my_account (este projeto não permite SET ROLE
 * supabase_auth_admin para um SECURITY DEFINER deletar de auth.users).
 *
 *   POST /  (Authorization: Bearer <access_token do Supabase>)  -> 200 em sucesso
 *
 * SEGURANCA (CRÍTICA): este Worker guarda a SECRET key e poderia deletar QUALQUER
 * usuário, então ele SÓ apaga a conta do PRÓPRIO chamador:
 *   1. valida o JWT do Supabase por assinatura (JWKS/ES256), com a publishable key
 *      como apikey — igual ao ai-proxy/tts-proxy/image-proxy;
 *   2. o id a apagar vem SOMENTE do `sub` do token verificado. NUNCA de parametro;
 *   3. guarda de plano pago (defesa em profundidade): le profiles.plan com a
 *      service key; se for basic/advanced -> 403 e NAO apaga;
 *   4. limpa pending_plans pelo email do token (best-effort); e
 *   5. DELETE /auth/v1/admin/users/{sub} com a service key (hard delete) ->
 *      CASCATA para profiles/decks/cards/review_logs/gamification/
 *      achievement_unlocks/usage_counters e auth.*.
 *
 * Mídia: já removida pelo cliente via Storage API ANTES desta chamada; o Worker
 * NAO toca em Storage.
 *
 * Segredos (Wrangler; nunca no codigo): SUPABASE_URL, SUPABASE_ANON_KEY
 * (publishable, p/ o JWKS), SUPABASE_SECRET_KEY (sb_secret_, service role).
 */

export interface Env {
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
  /** Supabase: URL do projeto. JWKS = {URL}/auth/v1/.well-known/jwks.json */
  SUPABASE_URL: string;
  /** Supabase: publishable key (sb_publishable_...), usada como apikey no JWKS. */
  SUPABASE_ANON_KEY: string;
  /** Supabase: chave SECRETA (sb_secret_..., service role) p/ profiles + admin. */
  SUPABASE_SECRET_KEY: string;
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

// ── JWT (ES256 / JWKS) verification ── (mesma abordagem do ai-proxy/image-proxy)

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
  email: string | null;
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

/** Chaves do JWKS: usa o cache se fresco; senao busca. Em falha, cai no cache
 *  antigo se existir. forceRefresh ignora o cache (usado na rotacao de kid). */
async function getJwks(env: Env, forceRefresh: boolean): Promise<Jwk[] | null> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (jwksCache && fresh && !forceRefresh) return jwksCache.keys;
  const keys = await fetchJwks(env);
  if (keys) return keys;
  return jwksCache ? jwksCache.keys : null;
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
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: jwk.crv ?? 'P-256', x: jwk.x, y: jwk.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    // A assinatura JWS ES256 ja vem como r||s cru (P1363), que e o que o WebCrypto
    // ECDSA verify espera.
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

  const email = typeof payload.email === 'string' && payload.email ? payload.email : null;
  return { sub: payload.sub, email };
}

// ── Supabase REST + Auth Admin (com a SERVICE key) ───────────────────────────

/** Le profiles.plan com a service key (ignora RLS). null = falha de leitura;
 *  'free' quando nao ha linha (conta sem plano pago). */
async function fetchPlan(env: Env, uid: string): Promise<string | null> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const url = `${base}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=plan&limit=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let rows: Array<{ plan?: string }>;
  try {
    rows = (await res.json()) as Array<{ plan?: string }>;
  } catch {
    return null;
  }
  return rows[0]?.plan ?? 'free';
}

/** Remove qualquer plano estacionado por email (best-effort). Nao lanca. */
async function deletePendingPlans(env: Env, email: string): Promise<void> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const url = `${base}/rest/v1/pending_plans?email=eq.${encodeURIComponent(email.toLowerCase())}`;
  try {
    await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    });
  } catch {
    /* best-effort */
  }
}

/** Hard delete do usuario via Auth Admin API. true em 2xx. */
async function adminDeleteUser(env: Env, uid: string): Promise<boolean> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const url = `${base}/auth/v1/admin/users/${encodeURIComponent(uid)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    });
  } catch {
    return false;
  }
  return res.ok;
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

    // Origem enviada mas nao liberada -> bloqueia.
    if (origin && !cors['Access-Control-Allow-Origin']) {
      return json({ error: 'Origem não permitida.' }, 403, cors);
    }

    if (request.method === 'POST' && url.pathname === '/') {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SECRET_KEY) {
        console.error('delete-account: configuracao do servidor ausente (segredos)');
        return json({ error: 'Servidor não configurado.' }, 500, cors);
      }

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
      // O id a apagar vem SOMENTE do token verificado.
      const uid = claims.sub;

      // 2) Guarda de plano pago (service key, ignora RLS). null = nao deu p/ ler.
      const plan = await fetchPlan(env, uid);
      if (plan === null) {
        console.error('delete-account: falha ao ler o plano', { uid });
        return json({ error: 'Não foi possível verificar seu plano. Tente novamente.' }, 500, cors);
      }
      if (plan === 'basic' || plan === 'advanced') {
        return json(
          {
            error: 'plano ativo: cancele a assinatura na Kiwify antes de excluir a conta',
            code: 'paid_plan',
          },
          403,
          cors,
        );
      }

      // 3) Limpa pending_plans pelo email do token (best-effort, nao bloqueia).
      if (claims.email) {
        await deletePendingPlans(env, claims.email);
      }

      // 4) Hard delete via Auth Admin API -> cascata para public + auth.*.
      const deleted = await adminDeleteUser(env, uid);
      if (!deleted) {
        console.error('delete-account: admin delete falhou', { uid });
        return json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, 500, cors);
      }

      console.log('delete-account: conta excluída', { uid });
      return json({ ok: true }, 200, cors);
    }

    return json({ error: 'Não encontrado.' }, 404, cors);
  },
};
