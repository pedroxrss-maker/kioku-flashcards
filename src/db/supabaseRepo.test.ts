import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Back the repository with the in-memory fake supabase client (logged in).
vi.mock('../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return { supabase: createFakeSupabase({ userId: 'u-test' }), isSupabaseConfigured: true };
});

import { repo } from './repositories';
import { supabase } from '../lib/supabase';
import type { FakeTables } from '../test/fakeSupabase';

const tables = () => (supabase as unknown as { __tables: FakeTables }).__tables;

beforeEach(() => {
  const t = tables();
  t.decks.length = 0;
  t.cards.length = 0;
  t.review_logs.length = 0;
});

describe('SupabaseRepository field mapping', () => {
  it('round-trips a deck: camelCase <-> snake_case columns, epoch <-> timestamptz', async () => {
    const created = await repo.createDeck({
      name: 'Mapeado',
      color: '#1f6dff',
      category: 'Idiomas',
      algorithm: 'fsrs',
      newPerDay: 15,
      reviewsPerDay: 120,
      desiredRetention: 0.92,
      buttonCount: 3,
    });

    // Raw row stored with snake_case columns + user_id + ISO timestamp.
    const row = tables().decks[0] as Record<string, unknown>;
    expect(row.user_id).toBe('u-test');
    expect(row.new_per_day).toBe(15);
    expect(row.reviews_per_day).toBe(120);
    expect(row.desired_retention).toBe(0.92);
    expect(row.button_count).toBe(3);
    expect(typeof row.created_at).toBe('string');
    expect(new Date(row.created_at as string).toISOString()).toBe(row.created_at);

    // Reads back as the camelCase model with epoch ms.
    const read = await repo.getDeck(created.id);
    expect(read?.name).toBe('Mapeado');
    expect(read?.category).toBe('Idiomas');
    expect(read?.newPerDay).toBe(15);
    expect(read?.desiredRetention).toBe(0.92);
    expect(read?.buttonCount).toBe(3);
    expect(typeof read?.createdAt).toBe('number');
    expect(read?.createdAt).toBe(created.createdAt);
  });

  it('round-trips a card: keeps sm2/fsrs jsonb keys intact, converts due/timestamps', async () => {
    const deck = await repo.createDeck({ name: 'D', color: '#fff', algorithm: 'sm2' });
    const card = await repo.createCard({ deckId: deck.id, front: '<b>q</b>', back: 'a' });

    const row = tables().cards[0] as Record<string, unknown>;
    expect(row.deck_id).toBe(deck.id);
    expect(row.user_id).toBe('u-test');
    expect(typeof row.due).toBe('string'); // timestamptz on the wire
    expect(typeof row.created_at).toBe('string');
    expect(typeof row.updated_at).toBe('string');
    // jsonb blobs are passed through untouched (inner keys NOT snake_cased).
    expect(row.sm2).toEqual(card.sm2);
    expect((row.sm2 as { ease: number }).ease).toBe(2.5);
    expect(row.fsrs).toEqual(card.fsrs);

    const read = await repo.getCard(card.id);
    expect(read?.deckId).toBe(deck.id);
    expect(typeof read?.due).toBe('number'); // epoch ms in the model
    expect(read?.due).toBe(card.due);
    expect(read?.sm2).toEqual(card.sm2);
    expect(read?.fsrs).toEqual(card.fsrs);
  });

  it('stamps user_id on every insert (deck, card, review log)', async () => {
    const deck = await repo.createDeck({ name: 'D', color: '#fff', algorithm: 'sm2' });
    const card = await repo.createCard({ deckId: deck.id, front: 'q', back: 'a' });
    await repo.saveReview(card, {
      id: 'log-1',
      cardId: card.id,
      deckId: deck.id,
      rating: 'good',
      reviewedAt: Date.now(),
      durationMs: 1200,
      prevState: 'new',
      scheduledDays: 1,
    });

    const stamped = (rows: Record<string, unknown>[]) => rows.every((r) => r.user_id === 'u-test');
    expect(stamped(tables().decks)).toBe(true);
    expect(stamped(tables().cards)).toBe(true);
    expect(stamped(tables().review_logs)).toBe(true);
    expect(tables().review_logs.length).toBe(1);
  });

  it('writes review_logs.reviewed_at as ISO and reads it back as epoch ms', async () => {
    const deck = await repo.createDeck({ name: 'D', color: '#fff', algorithm: 'sm2' });
    const card = await repo.createCard({ deckId: deck.id, front: 'q', back: 'a' });
    const reviewedAt = Date.UTC(2026, 0, 2, 3, 4, 5);

    await repo.saveReview(card, {
      id: 'log-iso',
      cardId: card.id,
      deckId: deck.id,
      rating: 'easy',
      reviewedAt,
      durationMs: 800,
      prevState: 'new',
      scheduledDays: 4,
    });

    const row = tables().review_logs[0] as Record<string, unknown>;
    expect(typeof row.reviewed_at).toBe('string');
    expect(new Date(row.reviewed_at as string).getTime()).toBe(reviewedAt);
    expect(row.card_id).toBe(card.id);
    expect(row.deck_id).toBe(deck.id);
    expect(row.duration_ms).toBe(800);
    expect(row.prev_state).toBe('new');
    expect(row.scheduled_days).toBe(4);

    const logs = await repo.allLogs();
    const log = logs.find((l) => l.id === 'log-iso');
    expect(typeof log?.reviewedAt).toBe('number');
    expect(log?.reviewedAt).toBe(reviewedAt);
    expect(log?.durationMs).toBe(800);
    expect(log?.prevState).toBe('new');
    expect(log?.scheduledDays).toBe(4);
  });
});
