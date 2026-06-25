-- ----------------------------------------------------------------------------
-- FIX: deck_counts().new_count must honor each deck's new_per_day daily limit.
--
-- Symptom this fixes: a deck with new_per_day = 0 showed its RAW number of
-- new-state cards (e.g. "20 new") on the Home / Decks list, because an older
-- deployed deck_counts() returned `count(state='new')` directly instead of the
-- Anki "new to show today" clamp.
--
-- new_count = greatest(0, least(new_per_day - new_studied_today, total_new)):
--   * new_per_day = 0            -> 0 (show NO new cards today; 0 is intentional)
--   * new_per_day >= 1e9 sentinel -> total_new (unlimited: all remaining new)
--   * otherwise                   -> the per-deck daily limit minus today's studied
-- where new_studied_today counts review_logs (prev_state='new') for "today" in
-- America/Sao_Paulo — the SAME day boundary the streak and the review queue use.
--
-- Idempotent: run this in the Supabase SQL editor. `create or replace` swaps the
-- function in place; the client picks it up on the next deck_counts() call.
-- (This is identical to the deck_counts() in db/full-schema.sql.)
-- ----------------------------------------------------------------------------
create or replace function public.deck_counts()
returns table(
  deck_id uuid,
  new_count bigint,
  learning_count bigint,
  due_review_count bigint,
  due_any_count bigint,
  total_count bigint
) language sql stable security invoker set search_path = public as $$
  with card_counts as (
    select
      c.deck_id,
      count(*) filter (where c.state = 'new')                        as total_new,
      count(*) filter (where c.state in ('learning', 'relearning'))  as learning_count,
      count(*) filter (where c.state = 'review' and c.due <= now())  as due_review_count,
      count(*) filter (where c.due <= now())                         as due_any_count,
      count(*)                                                       as total_count
    from public.cards c
    where c.user_id = auth.uid()
    group by c.deck_id
  ),
  new_studied_today as (
    select rl.deck_id, count(*) as studied
    from public.review_logs rl
    where rl.user_id = auth.uid()
      and rl.prev_state = 'new'
      and (rl.reviewed_at at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date
    group by rl.deck_id
  )
  select
    cc.deck_id,
    case
      when d.new_per_day >= 1000000000 then cc.total_new
      else greatest(0, least(d.new_per_day - coalesce(nt.studied, 0), cc.total_new))
    end::bigint as new_count,
    cc.learning_count,
    cc.due_review_count,
    cc.due_any_count,
    cc.total_count
  from card_counts cc
  join public.decks d on d.id = cc.deck_id
  left join new_studied_today nt on nt.deck_id = cc.deck_id;
$$;
revoke all on function public.deck_counts() from public, anon;
grant execute on function public.deck_counts() to authenticated, service_role;
