/**
 * Best-effort text extraction from a URL, for turning a video or page into
 * flashcards. This is the most fragile path: web pages are usually blocked by
 * CORS when fetched from the browser, so failures are expected and surfaced as
 * pt-BR messages (suggesting the user paste the text manually instead). Nothing
 * here throws uncaught.
 */

/** Extract the YouTube video id from a watch / youtu.be / shorts / embed URL. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed|v)\/([\w-]+)/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** Flatten the various shapes the transcript API may return into plain text. */
function transcriptToText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data
      .map((seg) => (seg && typeof seg === 'object' ? String((seg as { text?: unknown }).text ?? '') : String(seg ?? '')))
      .join(' ');
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.transcript)) return transcriptToText(o.transcript);
    if (Array.isArray(o.segments)) return transcriptToText(o.segments);
    if (typeof o.text === 'string') return o.text;
  }
  return '';
}

/** Fetch a YouTube transcript from the public (no-key) API. */
async function fetchYouTubeTranscript(id: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://yt-transcript-api.vercel.app/api?videoId=${encodeURIComponent(id)}`);
  } catch {
    throw new Error('Não foi possível buscar a transcrição do YouTube (rede ou CORS).');
  }
  if (!res.ok) {
    throw new Error('Não foi possível obter a transcrição deste vídeo. Ele pode não ter legendas.');
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Resposta inesperada da API de transcrição do YouTube.');
  }
  const text = transcriptToText(data).replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Error('Este vídeo não tem transcrição disponível. Tente outro vídeo.');
  }
  return text.slice(0, 60000);
}

/** Fetch a web page and extract its readable text. Many sites block this with
 *  CORS; that is reported, not crashed. */
async function fetchPageText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      'Não foi possível acessar a página (provavelmente bloqueio de CORS). Copie o texto e use ' +
        'o modo "Anotações" em "Gerar deck com IA".',
    );
  }
  if (!res.ok) {
    throw new Error(`Não foi possível baixar a página (HTTP ${res.status}). Tente colar o texto manualmente.`);
  }
  let html: string;
  try {
    html = await res.text();
  } catch {
    throw new Error('Não foi possível ler o conteúdo da página.');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, nav, header, footer, svg, iframe').forEach((el) => el.remove());
  const main = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
  const text = (main?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 40) {
    throw new Error('Pouco texto encontrado na página. Tente colar o conteúdo no modo "Anotações".');
  }
  return text.slice(0, 60000);
}

/** Resolve a URL to extracted text plus a suggested deck title. YouTube watch
 *  URLs use the transcript API; everything else is fetched as a web page. */
export async function extractFromUrl(rawUrl: string): Promise<{ text: string; title: string }> {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Informe uma URL completa (começando com http:// ou https://).');
  }
  const vid = youTubeId(url);
  if (vid) {
    return { text: await fetchYouTubeTranscript(vid), title: `Vídeo do YouTube ${vid}` };
  }
  const text = await fetchPageText(url);
  let title = url;
  try {
    title = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep the raw url as the title */
  }
  return { text, title };
}
