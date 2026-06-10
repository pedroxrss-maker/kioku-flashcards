/**
 * Approximate Supabase Storage usage tracking plus a pt-BR warning near the
 * free-tier limit (1 GB). We keep a running byte total in profiles.settings
 * (storageBytesUsed) and bump it after uploads, so we never have to list the
 * whole bucket. Call warnIfStorageHigh after big operations (batch audio, big
 * import).
 */
import { repo } from '../../db/repositories';
import { pushToast } from '../../lib/toast';

const WARN_BYTES = 800 * 1024 * 1024; // 800 MB (free tier is 1 GB)

export function formatStorageSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Add uploaded bytes to the user's running total; returns the new total. */
export async function recordStorageUpload(bytes: number): Promise<number> {
  const settings = await repo.getSettings();
  const current = settings.storageBytesUsed ?? 0;
  if (bytes <= 0) return current;
  const next = current + bytes;
  await repo.saveSettings({ storageBytesUsed: next });
  return next;
}

/** Non-blocking pt-BR toast when usage is past the 800 MB mark. */
export function warnIfStorageHigh(totalBytes: number): void {
  if (totalBytes >= WARN_BYTES) {
    pushToast(
      'info',
      `Você já usou cerca de ${formatStorageSize(totalBytes)} de mídia na nuvem ` +
        '(o limite gratuito do Supabase é 1 GB). Considere remover áudios e imagens que não usa mais.',
    );
  }
}
