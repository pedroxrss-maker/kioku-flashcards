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
 */

export interface Env {
  /** Wrangler secret: `wrangler secret put OPENAI_API_KEY`. */
  OPENAI_API_KEY: string;
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
}

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
    'Access-Control-Allow-Headers': 'Content-Type',
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

    // POST / : gera a imagem na OpenAI com a chave do servidor e devolve { image }.
    if (request.method === 'POST' && url.pathname === '/') {
      if (!env.OPENAI_API_KEY) {
        return json({ error: 'Chave da OpenAI não configurada no servidor.' }, 500, cors);
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
