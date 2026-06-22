/**
 * Centralized Supabase Storage access for media (audio + images).
 *
 * Everything goes through the standard supabase client
 * (supabase.storage.from('media')), with no hardcoded project URLs, so a future
 * self-hosted Supabase keeps working. The "media" bucket is PRIVATE; objects
 * live under "{user_id}/{deck_id}/{filename}" and are read via short-lived
 * signed URLs (cached in memory so we do not re-sign on every render).
 *
 * The bucket and its RLS policies are created out of band (db/storage-setup.sql)
 * because they cannot be created from the app. If the bucket/policies are
 * missing, uploads fail and we surface a clear pt-BR message via
 * StorageUnavailableError so the user knows to run the SQL.
 */
import { supabase } from '../../lib/supabase';

export const MEDIA_BUCKET = 'media';

/**
 * Thrown when the bucket or its RLS policies are missing (HTTP 400/403/404 /
 * "Bucket not found" / RLS violation). The message is pt-BR and safe to show.
 */
export class StorageUnavailableError extends Error {}

const SETUP_HINT =
  'Armazenamento de mídia indisponível. Rode o SQL de configuração (db/storage-setup.sql) ' +
  'no painel do Supabase e confirme que o bucket "media" existe.';

/** Detects the "bucket/policy not configured" class of errors, vs transient ones. */
function asSetupError(err: unknown): StorageUnavailableError | null {
  if (!err) return null;
  const e = err as { message?: string; status?: number; statusCode?: number | string };
  const msg = String(e.message ?? err).toLowerCase();
  const status = Number(e.status ?? e.statusCode ?? 0);
  const bucketMissing = msg.includes('bucket not found') || (msg.includes('bucket') && msg.includes('not found'));
  const denied =
    msg.includes('row-level security') ||
    msg.includes('violates row-level') ||
    msg.includes('not authorized') ||
    msg.includes('unauthorized');
  if (bucketMissing || denied || status === 400 || status === 403 || status === 404) {
    return new StorageUnavailableError(SETUP_HINT);
  }
  return null;
}

/* --------------------------------------------------------- signed-url cache -- */
interface CachedUrl {
  url: string;
  expiresAt: number; // epoch ms
}
const signedCache = new Map<string, CachedUrl>();
const SIGN_MARGIN_MS = 60_000; // refresh a bit before actual expiry
// In-flight signs, keyed by path: a concurrent single + batch (or two batches)
// asking for the same path share ONE network round-trip instead of racing.
const inflightSign = new Map<string, Promise<void>>();

/* ------------------------------------------------------------------ paths -- */
/** Current authenticated user id (first path segment, enforced by RLS). */
export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Sessão expirada. Entre novamente.');
  const id = data.session?.user?.id;
  if (!id) throw new Error('Você precisa estar conectado.');
  return id;
}

/** Keep an object-key segment URL/Storage safe (Anki filenames can be messy). */
export function sanitizeSegment(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '') || 'file'
  );
}

/** Canonical object path: "{user_id}/{deck_id}/{filename}". */
export async function mediaObjectPath(deckId: string, filename: string): Promise<string> {
  const uid = await currentUserId();
  return `${uid}/${deckId}/${sanitizeSegment(filename)}`;
}

/* ----------------------------------------------------------------- upload -- */
export async function uploadMedia(path: string, blob: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) {
    const setup = asSetupError(error);
    if (setup) throw setup;
    throw new Error('Não foi possível enviar a mídia. Tente novamente.');
  }
  // A fresh upload may replace an object whose signed URL we cached: drop it.
  signedCache.delete(path);
}

/* ------------------------------------------------------------- signed url -- */
/**
 * Sign MANY object paths in ONE request (Storage `createSignedUrls`), reusing the
 * in-memory cache and de-duping in-flight signs. Returns path -> URL for every
 * path that resolved (a per-item failure is just omitted, so one broken media
 * never blocks the rest). Throws only on a setup error (bucket/policy missing).
 */
export async function getSignedUrls(
  paths: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const need: string[] = [];
  const waits: Promise<void>[] = [];
  for (const p of paths) {
    const hit = signedCache.get(p);
    if (hit && hit.expiresAt - now > SIGN_MARGIN_MS) {
      result.set(p, hit.url);
      continue;
    }
    const pending = inflightSign.get(p);
    if (pending) waits.push(pending); // already being signed — just wait, no new call
    else need.push(p);
  }

  if (need.length > 0) {
    const batch = (async () => {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(need, expiresIn);
      if (error) {
        const setup = asSetupError(error);
        if (setup) throw setup;
        return; // transient: leave unsigned (callers fall back), don't poison the cache
      }
      const at = Date.now() + expiresIn * 1000;
      for (const item of data ?? []) {
        if (item?.signedUrl && item?.path) signedCache.set(item.path, { url: item.signedUrl, expiresAt: at });
      }
    })();
    // Mark each path in-flight so a concurrent caller waits on this one batch.
    const settled = batch.then(
      () => {},
      () => {},
    );
    for (const p of need) inflightSign.set(p, settled.finally(() => inflightSign.delete(p)));
    await batch; // rethrows a setup error to the caller
  }

  if (waits.length > 0) await Promise.allSettled(waits);

  for (const p of paths) {
    if (result.has(p)) continue;
    const hit = signedCache.get(p);
    if (hit) result.set(p, hit.url);
  }
  return result;
}

/** Sign ONE object path (delegates to the batched signer, so it shares the cache
 *  + in-flight de-dup). Throws if it could not be signed. */
export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const urls = await getSignedUrls([path], expiresIn);
  const url = urls.get(path);
  if (!url) throw new Error('Não foi possível carregar a mídia.');
  return url;
}

/* ----------------------------------------------------------------- remove -- */
export async function removeMedia(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  signedCache.delete(path);
  if (error) {
    const setup = asSetupError(error);
    if (setup) throw setup;
    throw new Error('Não foi possível remover a mídia.');
  }
}
