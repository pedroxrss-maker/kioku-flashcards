import type { AppSettings } from '../db/types';

/**
 * Whether pronunciation/attached audio is enabled for a deck. Decks with no
 * stored preference default to ENABLED (existing decks keep their behavior);
 * newly created and imported decks explicitly store `false`.
 */
export function deckAudioEnabled(settings: AppSettings | undefined, deckId: string): boolean {
  return settings?.deckAudio?.[deckId] !== false;
}
