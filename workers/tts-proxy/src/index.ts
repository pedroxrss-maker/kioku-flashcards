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
 */

export interface Env {
  /** Wrangler secret: `wrangler secret put GOOGLE_TTS_API_KEY`. */
  GOOGLE_TTS_API_KEY: string;
  /** Origens permitidas, separadas por virgula (dominio de producao + dev). */
  ALLOWED_ORIGINS: string;
}

const GOOGLE_TTS = 'https://texttospeech.googleapis.com/v1';

interface SynthesizeBody {
  text?: string;
  voiceName?: string;
  languageCode?: string;
  audioEncoding?: 'MP3' | 'OGG_OPUS' | 'LINEAR16';
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

    // GET /voices (opcional): lista curada para o seletor.
    if (request.method === 'GET' && url.pathname === '/voices') {
      return json({ voices: CURATED_VOICES }, 200, cors);
    }

    // POST /synthesize: gera o audio no Google e devolve { audioContent }.
    if (request.method === 'POST' && url.pathname === '/synthesize') {
      if (!env.GOOGLE_TTS_API_KEY) {
        return json({ error: 'Credencial do Google não configurada no servidor.' }, 500, cors);
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
