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
  'Armazenamento de midia indisponivel. Rode o SQL de configuracao (db/storage-setup.sql) ' +
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

/* ------------------------------------------------------------------ paths -- */
/** Current authenticated user id (first path segment, enforced by RLS). */
export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Sessao expirada. Entre novamente.');
  const id = data.session?.user?.id;
  if (!id) throw new Error('Voce precisa estar conectado.');
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
    throw new Error('Nao foi possivel enviar a midia. Tente novamente.');
  }
  // A fresh upload may replace an object whose signed URL we cached: drop it.
  signedCache.delete(path);
}

/* ------------------------------------------------------------- signed url -- */
export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const now = Date.now();
  const hit = signedCache.get(path);
  if (hit && hit.expiresAt - now > SIGN_MARGIN_MS) return hit.url;

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    const setup = asSetupError(error);
    if (setup) throw setup;
    throw new Error('Nao foi possivel carregar a midia.');
  }
  signedCache.set(path, { url: data.signedUrl, expiresAt: now + expiresIn * 1000 });
  return data.signedUrl;
}

/* ----------------------------------------------------------------- remove -- */
export async function removeMedia(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  signedCache.delete(path);
  if (error) {
    const setup = asSetupError(error);
    if (setup) throw setup;
    throw new Error('Nao foi possivel remover a midia.');
  }
}
