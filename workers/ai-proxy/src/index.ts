/**
 * Kioku AI proxy (Cloudflare Worker).
 *
 * Guarda a chave da API do Google Gemini no servidor e expoe um endpoint simples
 * para o app Kioku:
 *   POST /  { model, contents, systemInstruction?, generationConfig }
 *           -> repassa a resposta JSON do Gemini (candidates[...]) sem alterar
 *
 * O navegador NUNCA recebe a chave. NUNCA cometa segredos: a chave vem de
 * env.GOOGLE_GEMINI_API_KEY (Wrangler secret; localmente via .dev.vars, ignorado
 * pelo git). O `model` chega no corpo e vai na URL do Gemini; o resto do corpo
 * (contents, systemInstruction, generationConfig) e repassado como veio.
 */

export interface Env {
  /** Wrangler secret: `wrangler secret put GOOGLE_GEMINI_API_KEY`. */
  GOOGLE_GEMINI_API_KEY: string;
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GenerateBody {
  model?: string;
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

    // POST / : repassa a geracao para o Gemini com a chave do servidor.
    if (request.method === 'POST' && url.pathname === '/') {
      if (!env.GOOGLE_GEMINI_API_KEY) {
        return json({ error: 'Chave da IA não configurada no servidor.' }, 500, cors);
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

      // A chave vai no cabecalho x-goog-api-key (fora da URL e dos logs). O `model`
      // vai na URL; o corpo repassado ao Google e so o do Gemini (sem `model`).
      const geminiBody: Record<string, unknown> = { contents: body.contents };
      if (body.systemInstruction !== undefined) geminiBody.systemInstruction = body.systemInstruction;
      if (body.generationConfig !== undefined) geminiBody.generationConfig = body.generationConfig;

      let googleRes: Response;
      try {
        googleRes = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GOOGLE_GEMINI_API_KEY,
          },
          body: JSON.stringify(geminiBody),
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

      // Repassa o JSON do Gemini como veio (o cliente le candidates[...]).
      const data = await googleRes.json();
      return json(data, 200, cors);
    }

    return json({ error: 'Não encontrado.' }, 404, cors);
  },
};
