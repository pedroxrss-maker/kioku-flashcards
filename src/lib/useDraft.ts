/**
 * React glue around the IndexedDB draft store (src/lib/drafts.ts): restore a
 * draft when a screen activates, persist it debounced as the user edits, and
 * clear it on a successful commit. Designed for the create-deck / edit-deck /
 * add-cards modals, but generic.
 *
 * All persistence is best-effort (see drafts.ts) — if IndexedDB is unavailable
 * the hook simply never restores or saves, and the form works normally.
 */
import { useEffect, useRef, useState } from 'react';
import { deleteDraft, getDraft, scopedDraftKey, setDraft } from './drafts';
import { supabase } from './supabase';

/**
 * Current authenticated user id (reactive), read straight from the Supabase
 * session. Kept here (not via the React AuthProvider) so the draft store scopes
 * keys per user without coupling to — or requiring — that provider in every
 * surface/test. Returns null while signed out or if auth is unavailable.
 */
function useCurrentUserId(): string | null {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUid(data.session?.user?.id ?? null);
      })
      .catch(() => {
        /* auth unavailable -> treat as signed out (no draft scope) */
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return uid;
}

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
  // Scope every draft to the CURRENT user. IndexedDB is per-browser, not per-user,
  // so an un-scoped key would let account B restore account A's draft on a shared
  // browser (a content leak). With no logged-in user (or no base key), the hook is
  // disabled entirely — nothing is ever restored or saved. Save AND restore use
  // this same scoped key, so a user still gets their OWN draft back.
  const userId = useCurrentUserId();
  const scopedKey = key && userId ? scopedDraftKey(userId, key) : null;

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
    if (!active || !scopedKey) return;
    let cancelled = false;
    void getDraft<T>(scopedKey).then((draft) => {
      if (cancelled) return;
      if (draft && hasContentRef.current(draft)) onRestoreRef.current(draft);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [active, scopedKey]);

  // Debounced persist. `serialized` only changes when the draft content changes,
  // so unrelated re-renders don't reset the timer (no per-render thrash).
  const serialized = active && scopedKey ? safeStringify(value) : '';
  useEffect(() => {
    if (!active || !scopedKey) return;
    const t = setTimeout(() => {
      if (!hydratedRef.current) return;
      if (hasContentRef.current(valueRef.current)) void setDraft(scopedKey, valueRef.current);
      else void deleteDraft(scopedKey);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [active, scopedKey, serialized, debounceMs]);

  // Flush the latest value when the screen deactivates / unmounts, so an edit
  // made within the debounce window (then navigating away) isn't lost.
  useEffect(() => {
    if (!active || !scopedKey) return;
    return () => {
      if (hydratedRef.current && hasContentRef.current(valueRef.current)) {
        void setDraft(scopedKey, valueRef.current);
      }
    };
  }, [active, scopedKey]);

  return {
    clear: () => {
      if (scopedKey) void deleteDraft(scopedKey);
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
