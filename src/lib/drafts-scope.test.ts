import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getDraft, pruneForeignDrafts, scopedDraftKey, setDraft } from './drafts';

/**
 * Cross-account leak guard: IndexedDB is per-BROWSER, so drafts must be scoped to
 * the signed-in user. These tests prove account B can never read account A's draft
 * on the same browser, while account A still gets its own draft back.
 */
const A = 'user-A';
const B = 'user-B';
const KEYS = ['draft:ai-generate', 'draft:create-deck', 'draft:edit-deck:d1', 'draft:add-cards:d1'];

describe('per-user draft scoping', () => {
  it('namespaces the key by user id', () => {
    expect(scopedDraftKey(A, 'draft:ai-generate')).toBe('u:user-A:draft:ai-generate');
    expect(scopedDraftKey(A, 'draft:ai-generate')).not.toBe(scopedDraftKey(B, 'draft:ai-generate'));
  });

  it("account B cannot read account A's draft, for every draft key; A gets its own back", async () => {
    for (const key of KEYS) {
      await setDraft(scopedDraftKey(A, key), { secret: `A:${key}` });
      // Account B (same browser) reads ITS OWN scoped key → nothing (no leak).
      await expect(getDraft(scopedDraftKey(B, key))).resolves.toBeNull();
      // Account A reads its own scoped key → gets its draft back (feature preserved).
      await expect(getDraft(scopedDraftKey(A, key))).resolves.toEqual({ secret: `A:${key}` });
    }
  });

  it('pruneForeignDrafts removes other users + legacy un-namespaced drafts, keeps the current user', async () => {
    await setDraft(scopedDraftKey(A, 'draft:create-deck'), { who: 'A' });
    await setDraft(scopedDraftKey(B, 'draft:create-deck'), { who: 'B' });
    await setDraft('draft:create-deck', { who: 'legacy' }); // pre-fix, un-namespaced

    await pruneForeignDrafts(A);

    await expect(getDraft(scopedDraftKey(A, 'draft:create-deck'))).resolves.toEqual({ who: 'A' });
    await expect(getDraft(scopedDraftKey(B, 'draft:create-deck'))).resolves.toBeNull();
    await expect(getDraft('draft:create-deck')).resolves.toBeNull();
  });
});
