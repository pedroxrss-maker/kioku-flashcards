import { describe, it, expect } from 'vitest';
import {
  DRAFT_TTL_MS,
  cleanupDrafts,
  deleteDraft,
  getDraft,
  isDraftExpired,
  setDraft,
} from './drafts';

describe('isDraftExpired (7-day TTL)', () => {
  it('keeps fresh drafts', () => {
    expect(isDraftExpired(Date.now())).toBe(false);
    expect(isDraftExpired(Date.now() - 1000)).toBe(false);
  });

  it('expires drafts older than the TTL', () => {
    const now = 10_000_000_000_000;
    expect(isDraftExpired(now - DRAFT_TTL_MS, now)).toBe(false); // exactly TTL old: still valid
    expect(isDraftExpired(now - DRAFT_TTL_MS - 1, now)).toBe(true); // just past it: expired
  });

  it('treats a missing / non-finite timestamp as expired', () => {
    expect(isDraftExpired(Number.NaN)).toBe(true);
    expect(isDraftExpired(undefined as unknown as number)).toBe(true);
  });
});

describe('draft store is a safe no-op when IndexedDB is unavailable', () => {
  // The test runs in Node (no `indexedDB` global), exercising the robustness
  // requirement: every op must gracefully no-op, never throw, never block.
  it('reads return null; writes/deletes/cleanup resolve without throwing', async () => {
    await expect(getDraft('draft:create-deck')).resolves.toBeNull();
    await expect(setDraft('draft:create-deck', { name: 'x' })).resolves.toBeUndefined();
    await expect(deleteDraft('draft:create-deck')).resolves.toBeUndefined();
    await expect(cleanupDrafts()).resolves.toBeUndefined();
    // A value "set" without IndexedDB is not persisted, so the read still yields null.
    await setDraft('draft:add-cards:abc', { front: 'hi' });
    await expect(getDraft('draft:add-cards:abc')).resolves.toBeNull();
  });
});
