/**
 * React glue around the IndexedDB draft store (src/lib/drafts.ts): restore a
 * draft when a screen activates, persist it debounced as the user edits, and
 * clear it on a successful commit. Designed for the create-deck / edit-deck /
 * add-cards modals, but generic.
 *
 * All persistence is best-effort (see drafts.ts) — if IndexedDB is unavailable
 * the hook simply never restores or saves, and the form works normally.
 */
import { useEffect, useRef } from 'react';
import { deleteDraft, getDraft, setDraft } from './drafts';

interface UseDraftOptions<T> {
  /** Where to store it, e.g. "draft:create-deck" or "draft:add-cards:{id}". A
   *  null key disables the hook (e.g. while data needed for the key is missing). */
  key: string | null;
  /** The current draft snapshot. Persisted (debounced) whenever it changes. */
  value: T;
  /** Only restore/persist while true (e.g. the modal is open and in "create"
   *  mode). Going false flushes the latest value first. */
  active: boolean;
  /** Guards against saving an empty/untouched form: return false to skip saving
   *  (and to delete any existing draft) and to ignore a restored empty draft. */
  hasContent: (v: T) => boolean;
  /** Repopulate the form from a restored draft. */
  onRestore: (v: T) => void;
  /** Debounce window for saves (ms). */
  debounceMs?: number;
}

export function useDraft<T>({
  key,
  value,
  active,
  hasContent,
  onRestore,
  debounceMs = 400,
}: UseDraftOptions<T>): { clear: () => void } {
  // Latest-value/callbacks refs so the debounce + flush use fresh data without
  // re-subscribing every render.
  const valueRef = useRef(value);
  valueRef.current = value;
  const hasContentRef = useRef(hasContent);
  hasContentRef.current = hasContent;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  // Don't persist until the initial restore attempt has settled, so the form's
  // reset-to-defaults (which runs on open) never overwrites a saved draft.
  const hydratedRef = useRef(false);

  // Restore on (re)activation or key change.
  useEffect(() => {
    hydratedRef.current = false;
    if (!active || !key) return;
    let cancelled = false;
    void getDraft<T>(key).then((draft) => {
      if (cancelled) return;
      if (draft && hasContentRef.current(draft)) onRestoreRef.current(draft);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [active, key]);

  // Debounced persist. `serialized` only changes when the draft content changes,
  // so unrelated re-renders don't reset the timer (no per-render thrash).
  const serialized = active && key ? safeStringify(value) : '';
  useEffect(() => {
    if (!active || !key) return;
    const t = setTimeout(() => {
      if (!hydratedRef.current) return;
      if (hasContentRef.current(valueRef.current)) void setDraft(key, valueRef.current);
      else void deleteDraft(key);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [active, key, serialized, debounceMs]);

  // Flush the latest value when the screen deactivates / unmounts, so an edit
  // made within the debounce window (then navigating away) isn't lost.
  useEffect(() => {
    if (!active || !key) return;
    return () => {
      if (hydratedRef.current && hasContentRef.current(valueRef.current)) {
        void setDraft(key, valueRef.current);
      }
    };
  }, [active, key]);

  return {
    clear: () => {
      if (key) void deleteDraft(key);
    },
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(Date.now()); // force a save attempt rather than skip
  }
}
