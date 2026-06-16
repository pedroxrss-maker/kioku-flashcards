/**
 * Kioku Kiwify webhook (Cloudflare Worker).
 *
 * Recebe os webhooks de venda da Kiwify e atualiza o plano do usuario na tabela
 * public.profiles do Supabase:
 *   POST /  (corpo JSON da Kiwify)  -> 200 sempre que tratado/ignorado de proposito
 *
 * SEGURANCA PRIMEIRO: a Kiwify assina cada chamada. Ela acrescenta
 * `?signature=<hex>` na URL, onde signature = HMAC-SHA1(corpo_cru, TOKEN). O
 * Worker recalcula o HMAC sobre o corpo CRU e compara em tempo constante. Como
 * alternativa manual, aceita um token estatico em `?token=` ou no cabecalho
 * `x-kiwify-webhook-token`. Sem assinatura/token valido -> 401 e nada acontece.
 *
 * Mapeamento produto -> plano (IDs reais dos dois produtos):
 *   f1353580-... -> 'basic'      90a04bd0-... -> 'advanced'
 *
 * Eventos -> acao (campos lidos de forma DEFENSIVA + logados para conferir com
 * um webhook real):
 *   compra aprovada / paid, assinatura renovada -> seta o plano do produto
 *   reembolso, chargeback, assinatura cancelada -> seta 'free'
 *   assinatura atrasada (late/overdue)          -> NAO faz nada (nao rebaixa)
 *   qualquer outro (pix/boleto gerado, recusada)-> ignora (200)
 *
 * Email -> usuario: profiles nao guarda email, entao o Worker chama a funcao
 * SECURITY DEFINER public.set_plan_by_email(email, plano) (ver
 * db/set-plan-by-email.sql) com a SECRET key (service role). Ela resolve o
 * auth.users.id pelo email e atualiza profiles.plan, retornando quantas linhas
 * mudaram (0 = nenhum usuario com esse email).
 *
 * Segredos (Wrangler; nunca no codigo): SUPABASE_URL, SUPABASE_SECRET_KEY,
 * KIWIFY_WEBHOOK_TOKEN. Local: .dev.vars (ignorado pelo git).
 */

export interface Env {
  /** Wrangler secret: URL do projeto Supabase, ex. https://xxxx.supabase.co */
  SUPABASE_URL: string;
  /** Wrangler secret: chave SECRETA (sb_secret_..., nivel service role). */
  SUPABASE_SECRET_KEY: string;
  /** Wrangler secret: token do webhook (painel da Kiwify). E a chave do HMAC. */
  KIWIFY_WEBHOOK_TOKEN: string;
}

type Plan = 'free' | 'basic' | 'advanced';
type PaidPlan = Exclude<Plan, 'free'>;

/** IDs reais dos dois produtos (publicos, nao sao segredo). */
const PRODUCT_PLAN: Record<string, PaidPlan> = {
  'f1353580-6912-11f1-b760-8b671470803c': 'basic',
  '90a04bd0-6915-11f1-9476-47ac9f22b2c0': 'advanced',
};

function planForProduct(productId: string | null): PaidPlan | null {
  if (productId && productId in PRODUCT_PLAN) return PRODUCT_PLAN[productId];
  return null;
}

/** Resposta simples em texto (a Kiwify so precisa do status 2xx). */
function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ── Seguranca: assinatura HMAC-SHA1 (ou token estatico) ──────────────────────

async function hmacSha1Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/** Comparacao em tempo constante (nao revela por timing onde os valores diferem). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Autentica o webhook. ORDEM: o TOKEN estatico vem PRIMEIRO. Se o ?token= (ou o
 * cabecalho x-kiwify-webhook-token) bater com KIWIFY_WEBHOOK_TOKEN, ACEITA na
 * hora, mesmo que a Kiwify tambem mande ?signature=. So quando o token falta ou
 * esta errado e que tentamos a assinatura HMAC-SHA1 (hex) do corpo cru. (Antes a
 * assinatura tinha prioridade e dava 401 mesmo com o token certo.)
 */
async function isAuthentic(env: Env, url: URL, headers: Headers, rawBody: string): Promise<boolean> {
  const secret = env.KIWIFY_WEBHOOK_TOKEN;
  if (!secret) return false;

  // 1) Token estatico: lido do query param chamado EXATAMENTE "token" (ou do
  //    cabecalho x-kiwify-webhook-token), comparado com KIWIFY_WEBHOOK_TOKEN.
  const tokenParam = url.searchParams.get('token');
  const tokenHeader = headers.get('x-kiwify-webhook-token');
  const provided = tokenParam ?? tokenHeader ?? '';
  const tokenPresent = provided.length > 0;
  const tokenMatch = tokenPresent && timingSafeEqual(provided, secret);

  // 2) Assinatura HMAC-SHA1 (hex) no query param "signature", sobre o corpo cru.
  const signature = url.searchParams.get('signature');
  let signatureMatch = false;
  if (signature) {
    const expected = await hmacSha1Hex(secret, rawBody);
    signatureMatch = timingSafeEqual(signature.toLowerCase(), expected.toLowerCase());
  }

  // Token correto sozinho BASTA; senao, vale a assinatura.
  return tokenMatch || signatureMatch;
}

// ── Leitura defensiva do payload ─────────────────────────────────────────────

function pick(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Primeiro valor string nao-vazio entre os caminhos dados. */
function firstString(obj: Record<string, unknown>, paths: string[]): string | null {
  for (const p of paths) {
    const v = pick(obj, p);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

type Action =
  | { kind: 'set'; plan: PaidPlan }
  | { kind: 'free' }
  | { kind: 'noop' }
  | { kind: 'ignore' };

/**
 * Decide a acao a partir do tipo de evento + status (em minusculas, casado por
 * substring para tolerar variacoes de nome/idioma). "Atrasada" vem primeiro:
 * nunca rebaixa. mappedPlan ja foi confirmado como um dos nossos produtos.
 */
function decideAction(eventType: string, status: string, mappedPlan: PaidPlan): Action {
  const sig = `${eventType} ${status}`.toLowerCase();

  if (sig.includes('late') || sig.includes('overdue') || sig.includes('atrasad')) {
    return { kind: 'noop' };
  }
  if (
    sig.includes('refund') ||
    sig.includes('reembol') ||
    sig.includes('chargeback') ||
    sig.includes('charged') ||
    sig.includes('cancel')
  ) {
    return { kind: 'free' };
  }
  if (
    sig.includes('approved') ||
    sig.includes('aprovad') ||
    sig.includes('paid') ||
    sig.includes('renew') ||
    sig.includes('renovad')
  ) {
    return { kind: 'set', plan: mappedPlan };
  }
  return { kind: 'ignore' };
}

// ── Supabase: aplica o plano pelo email (RPC SECURITY DEFINER) ───────────────

/**
 * Chama public.set_plan_by_email(email, plano) via PostgREST com a SECRET key.
 * Retorna o numero de linhas atualizadas, ou null em erro real (rede/HTTP) -> 500
 * para a Kiwify reenviar.
 */
async function setPlanByEmail(env: Env, email: string, plan: Plan): Promise<number | null> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/rest/v1/rpc/set_plan_by_email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
      body: JSON.stringify({ p_email: email, p_plan: plan }),
    });
  } catch (e) {
    console.error('kiwify: falha de rede ao chamar set_plan_by_email', String(e));
    return null;
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    console.error('kiwify: erro do Supabase no RPC', res.status, detail);
    return null;
  }
  // Funcao escalar (returns integer): PostgREST devolve o valor direto.
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (typeof data === 'number') return data;
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0] as number;
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return text('Method Not Allowed', 405);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.KIWIFY_WEBHOOK_TOKEN) {
      console.error('kiwify: configuracao do servidor ausente (segredos)');
      return text('Server not configured', 500);
    }

    // Corpo CRU primeiro: a assinatura HMAC e calculada sobre estes bytes.
    const raw = await request.text();

    // 1) Autenticidade. Sem assinatura/token valido -> 401, nada acontece.
    const ok = await isAuthentic(env, url, request.headers, raw);
    if (!ok) {
      console.warn('kiwify: assinatura/token invalido - 401');
      return text('Unauthorized', 401);
    }

    // 2) Parse do JSON.
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error('kiwify: corpo JSON invalido');
      return text('Bad Request', 400);
    }

    // 3) Campos lidos de forma defensiva (varios nomes possiveis) + log p/ conferir.
    const productId = firstString(payload, [
      'Product.product_id',
      'product.id',
      'Product.id',
      'product_id',
    ]);
    const email = firstString(payload, ['Customer.email', 'customer.email', 'email', 'buyer.email']);
    const eventType =
      firstString(payload, ['webhook_event_type', 'event', 'type', 'webhook_event']) ?? '';
    const status = firstString(payload, ['order_status', 'status', 'Subscription.status']) ?? '';

    console.log('kiwify: evento recebido', {
      eventType,
      status,
      productId,
      hasEmail: Boolean(email),
    });

    // 4) Tem que ser um dos nossos produtos para fazer qualquer coisa.
    const mappedPlan = planForProduct(productId);
    if (!mappedPlan) {
      console.log('kiwify: ignorado (produto fora do nosso catalogo)', { productId });
      return text('ignored: not our product', 200);
    }

    // 5) Decide a acao.
    const action = decideAction(eventType, status, mappedPlan);
    if (action.kind === 'noop') {
      console.log('kiwify: noop (assinatura atrasada, nao rebaixa)', { eventType, status });
      return text('noop', 200);
    }
    if (action.kind === 'ignore') {
      console.log('kiwify: evento ignorado', { eventType, status });
      return text('ignored', 200);
    }

    // 6) set/free precisam do email do comprador.
    if (!email) {
      console.error('kiwify: sem email no payload, nao da para aplicar', {
        eventType,
        status,
        productId,
      });
      return text('ignored: missing email', 200);
    }

    const targetPlan: Plan = action.kind === 'free' ? 'free' : action.plan;

    // 7) Aplica no Supabase (resolve email -> user id -> profiles.plan).
    const updated = await setPlanByEmail(env, email, targetPlan);
    if (updated === null) {
      // Erro real (rede/HTTP): 500 para a Kiwify reenviar.
      return text('update failed', 500);
    }
    if (updated === 0) {
      // Sem conta para esse email AGORA. set_plan_by_email ja tratou: um plano
      // pago (basic/advanced) fica estacionado em pending_plans e e aplicado
      // sozinho quando o usuario entrar (apply_pending_plan); um 'free' sem conta
      // apenas limpa qualquer pending. Nada manual a fazer.
      console.warn('kiwify: sem usuario para o email; tratado via pending_plans', {
        targetPlan,
      });
      return text('ok: parked for later', 200);
    }

    console.log('kiwify: plano atualizado', { targetPlan, eventType, status });
    return text('ok', 200);
  },
};
