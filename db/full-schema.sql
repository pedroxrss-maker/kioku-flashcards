-- ============================================================================
-- Kioku: schema completo consolidado para recriar o banco do zero.
--
-- Combina os tres arquivos de db/:
--   - full-schema-dump.sql   (tabelas public, funcao/trigger handle_new_user,
--                             RLS e politicas das tabelas public)
--   - storage-setup.sql      (bucket privado "media" + politicas de storage)
--   - cards-media-columns.sql (coluna cards.audio_path; ja presente no dump,
--                             entao NAO e duplicada aqui)
--
-- Rode UMA vez, em um Supabase self-hosted vazio, como um papel privilegiado
-- (postgres). Ele cria triggers em auth.users e politicas em storage.objects,
-- entao precisa de um papel com permissao para isso.
--
-- Idempotente onde faz sentido (create ... if not exists, drop policy if
-- exists antes de create, on conflict do nothing). Nao contem dados (sem seed).
--
-- Pre-requisitos ja presentes numa instalacao padrao do Supabase (NAO criados
-- aqui): os schemas auth e storage, a tabela auth.users, as funcoes auth.uid()
-- e storage.foldername(), e os papeis anon / authenticated / service_role.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Extensoes
--    gen_random_uuid() ja faz parte do core no Postgres 13+; pgcrypto e
--    incluido apenas por compatibilidade. Outras extensoes do dump
--    (pg_stat_statements, supabase_vault, uuid-ossp) sao da plataforma e nao
--    sao recriadas aqui.
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- 2) Tabelas public (colunas, defaults, checks, chaves primarias e estrangeiras)
--    Ordem segue as dependencias: decks antes de cards, cards antes de
--    review_logs; profiles e independente. A coluna cards.audio_path ja esta
--    embutida em cards (vinda do dump) e nao e adicionada de novo.
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
    id uuid not null,
    display_name text default 'Estudante'::text not null,
    daily_goal integer default 40 not null,
    plan text default 'free'::text not null,
    settings jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    constraint profiles_pkey primary key (id),
    constraint profiles_plan_check check ((plan = any (array['free'::text, 'basic'::text, 'advanced'::text]))),
    constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade
);

create table if not exists public.decks (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    name text not null,
    color text default '#ff3b1f'::text not null,
    category text,
    algorithm text default 'fsrs'::text not null,
    new_per_day integer default 20 not null,
    reviews_per_day integer default 200 not null,
    desired_retention real default 0.9 not null,
    button_count integer default 4 not null,
    created_at timestamp with time zone default now() not null,
    constraint decks_pkey primary key (id),
    constraint decks_algorithm_check check ((algorithm = any (array['fsrs'::text, 'sm2'::text]))),
    constraint decks_button_count_check check ((button_count = any (array[2, 3, 4]))),
    constraint decks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.cards (
    id uuid default gen_random_uuid() not null,
    deck_id uuid not null,
    user_id uuid not null,
    front text default ''::text not null,
    back text default ''::text not null,
    state text default 'new'::text not null,
    due timestamp with time zone default now() not null,
    sm2 jsonb default '{"ease": 2.5, "reps": 0, "step": 0, "lapses": 0, "isLeech": false, "intervalDays": 0}'::jsonb not null,
    fsrs jsonb default '{"reps": 0, "lapses": 0, "stability": 0, "difficulty": 0, "lastReview": null, "elapsedDays": 0, "scheduledDays": 0}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    audio_path text,
    constraint cards_pkey primary key (id),
    constraint cards_state_check check ((state = any (array['new'::text, 'learning'::text, 'review'::text, 'relearning'::text]))),
    constraint cards_deck_id_fkey foreign key (deck_id) references public.decks(id) on delete cascade,
    constraint cards_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.review_logs (
    id uuid default gen_random_uuid() not null,
    card_id uuid not null,
    deck_id uuid not null,
    user_id uuid not null,
    rating text not null,
    reviewed_at timestamp with time zone default now() not null,
    duration_ms integer default 0 not null,
    prev_state text,
    scheduled_days integer,
    constraint review_logs_pkey primary key (id),
    constraint review_logs_rating_check check ((rating = any (array['again'::text, 'hard'::text, 'good'::text, 'easy'::text]))),
    constraint review_logs_card_id_fkey foreign key (card_id) references public.cards(id) on delete cascade,
    constraint review_logs_deck_id_fkey foreign key (deck_id) references public.decks(id) on delete cascade,
    constraint review_logs_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);


-- ----------------------------------------------------------------------------
-- 3) Indices (alem dos criados pelas chaves primarias)
-- ----------------------------------------------------------------------------
create index if not exists idx_cards_deck on public.cards using btree (deck_id);
create index if not exists idx_cards_due on public.cards using btree (user_id, due);
create index if not exists idx_decks_user on public.decks using btree (user_id);
create index if not exists idx_logs_user_time on public.review_logs using btree (user_id, reviewed_at);


-- ----------------------------------------------------------------------------
-- 4) Funcao + trigger: cria o perfil automaticamente quando um usuario se
--    cadastra (insert em auth.users). SECURITY DEFINER para inserir em
--    public.profiles mesmo com RLS ligado.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Estudante')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 5) Liga Row Level Security em cada tabela public
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;


-- ----------------------------------------------------------------------------
-- 6) Politicas RLS das tabelas public: cada usuario so le/grava o que e dele.
--    (Sem clausula TO: a condicao auth.uid() = ... ja bloqueia o anonimo.)
-- ----------------------------------------------------------------------------
drop policy if exists "perfil próprio" on public.profiles;
create policy "perfil próprio" on public.profiles
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

drop policy if exists "decks próprios" on public.decks;
create policy "decks próprios" on public.decks
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "cartas próprias" on public.cards;
create policy "cartas próprias" on public.cards
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "logs próprios" on public.review_logs;
create policy "logs próprios" on public.review_logs
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));


-- ----------------------------------------------------------------------------
-- 7) GRANTs: os papeis padrao do Supabase acessam as tabelas; o RLS acima
--    filtra as linhas por usuario. authenticated e o papel do usuario logado.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on table public.profiles to anon, authenticated, service_role;
grant all on table public.decks to anon, authenticated, service_role;
grant all on table public.cards to anon, authenticated, service_role;
grant all on table public.review_logs to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 7b) Gamificação: XP/nivel por usuario (uma linha) + historico de conquistas
--     desbloqueadas (uma linha por conquista). RLS isolada por usuario, igual
--     ao restante. (Mesmo conteudo do arquivo db/gamification.sql.)
-- ----------------------------------------------------------------------------
create table if not exists public.gamification (
    user_id    uuid not null,
    total_xp   integer default 0 not null,
    level      integer default 1 not null,
    updated_at timestamp with time zone default now() not null,
    constraint gamification_pkey primary key (user_id),
    constraint gamification_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
    constraint gamification_total_xp_check check ((total_xp >= 0)),
    constraint gamification_level_check check ((level >= 1))
);

create table if not exists public.achievement_unlocks (
    id              uuid default gen_random_uuid() not null,
    user_id         uuid not null,
    achievement_key text not null,
    unlocked_at     timestamp with time zone default now() not null,
    constraint achievement_unlocks_pkey primary key (id),
    constraint achievement_unlocks_user_key_unique unique (user_id, achievement_key),
    constraint achievement_unlocks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create index if not exists idx_achievement_unlocks_user
    on public.achievement_unlocks using btree (user_id, unlocked_at);

alter table public.gamification        enable row level security;
alter table public.achievement_unlocks enable row level security;

drop policy if exists "gamificação própria" on public.gamification;
create policy "gamificação própria" on public.gamification
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "conquistas próprias" on public.achievement_unlocks;
create policy "conquistas próprias" on public.achievement_unlocks
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

grant all on table public.gamification        to anon, authenticated, service_role;
grant all on table public.achievement_unlocks to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 7c) Limites de uso (freemium). A coluna profiles.plan ja esta embutida no
--     create table de profiles acima. Aqui: contadores por usuario/metrica/
--     periodo (RLS, escrita so via funcoes), os limites por plano (FONTE UNICA
--     em quota_rules, espelhada em src/features/usage/limits.ts) e as funcoes
--     atomicas consume_quota / get_usage. (Mesmo conteudo de db/usage-limits.sql.)
-- ----------------------------------------------------------------------------
create table if not exists public.usage_counters (
    user_id    uuid    not null,
    metric     text    not null,
    period     text    not null,
    bucket     text    not null,
    count      integer default 0 not null,
    updated_at timestamp with time zone default now() not null,
    constraint usage_counters_pkey primary key (user_id, metric, period),
    constraint usage_counters_user_id_fkey foreign key (user_id)
        references auth.users(id) on delete cascade,
    constraint usage_counters_metric_check
        check (metric = any (array['deckGen'::text, 'tutor'::text, 'image'::text, 'audio'::text])),
    constraint usage_counters_period_check
        check (period = any (array['day'::text, 'month'::text])),
    constraint usage_counters_count_check check (count >= 0)
);

alter table public.usage_counters enable row level security;

-- Leitura so do dono; escrita apenas pelas funcoes SECURITY DEFINER (sem policy
-- de insert/update/delete -> cliente nao adultera o proprio contador).
drop policy if exists "uso próprio (leitura)" on public.usage_counters;
create policy "uso próprio (leitura)" on public.usage_counters
  for select using (auth.uid() = user_id);

grant select on table public.usage_counters to authenticated;
grant all    on table public.usage_counters to service_role;

-- Limites por plano: FONTE UNICA. max_count: -1 = ilimitado, 0 = sempre nega.
create or replace function public.quota_rules(p_plan text)
returns table(metric text, period text, max_count integer)
language sql
immutable
as $$
  select r.metric, r.period, r.max_count
  from (values
    ('free',     'deckGen',  'month',     2),
    ('free',     'tutor',    'day',      15),
    ('free',     'image',    'month',     0),
    ('free',     'audio',    'month',    50),
    ('basic',    'deckGen',  'day',      10),
    ('basic',    'tutor',    'day',     100),
    ('basic',    'image',    'month',   100),
    ('basic',    'audio',    'month',   500),
    ('advanced', 'deckGen',  'month',    -1),
    ('advanced', 'tutor',    'month',    -1),
    ('advanced', 'image',    'month',   300),
    ('advanced', 'audio',    'month',    -1)
  ) as r(plan, metric, period, max_count)
  where r.plan = p_plan;
$$;

grant execute on function public.quota_rules(text) to anon, authenticated, service_role;

-- Chave do periodo atual (UTC). Troque 'utc' por 'America/Sao_Paulo' se quiser.
create or replace function public.current_bucket(p_period text)
returns text
language sql
stable
as $$
  select case p_period
    when 'month' then to_char((now() at time zone 'utc'), 'YYYY-MM')
    else              to_char((now() at time zone 'utc'), 'YYYY-MM-DD')
  end;
$$;

grant execute on function public.current_bucket(text) to anon, authenticated, service_role;

-- consume_quota: registra 1 uso, atomico (trava a linha ate o commit) e diz se
-- pode. Periodo/teto vem sempre do plano, nao do p_period (sem burla).
create or replace function public.consume_quota(p_metric text, p_period text)
returns table(allowed boolean, used integer, max_count integer, period_out text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_plan   text;
  v_period text;
  v_limit  integer;
  v_bucket text;
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(p.plan, 'free') into v_plan
  from public.profiles p where p.id = v_uid;
  v_plan := coalesce(v_plan, 'free');

  select qr.period, qr.max_count into v_period, v_limit
  from public.quota_rules(v_plan) qr where qr.metric = p_metric;

  if v_period is null then
    return query select true, 0, -1, coalesce(p_period, 'day');
    return;
  end if;

  if v_limit < 0 then
    return query select true, 0, -1, v_period;
    return;
  end if;

  if v_limit = 0 then
    return query select false, 0, 0, v_period;
    return;
  end if;

  v_bucket := public.current_bucket(v_period);

  -- Alias `uc` + colunas qualificadas: "period" colidiria com a coluna de saida
  -- "period" do RETURNS TABLE (variavel implicita do PL/pgSQL).
  insert into public.usage_counters as uc (user_id, metric, period, bucket, count)
  values (v_uid, p_metric, v_period, v_bucket, 0)
  on conflict (user_id, metric, period) do update
    set bucket     = v_bucket,
        count      = case when uc.bucket = v_bucket
                          then uc.count else 0 end,
        updated_at = now()
  returning uc.count into v_count;

  if v_count >= v_limit then
    return query select false, v_count, v_limit, v_period;
    return;
  end if;

  update public.usage_counters as uc
    set count = uc.count + 1, updated_at = now()
    where uc.user_id = v_uid and uc.metric = p_metric and uc.period = v_period
    returning uc.count into v_count;

  return query select true, v_count, v_limit, v_period;
end;
$$;

grant execute on function public.consume_quota(text, text) to authenticated, service_role;

-- get_usage: uso atual de todas as metricas do plano, sem incrementar.
create or replace function public.get_usage()
returns table(metric text, period text, used integer, max_count integer, remaining integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(p.plan, 'free') into v_plan
  from public.profiles p where p.id = v_uid;
  v_plan := coalesce(v_plan, 'free');

  return query
  select qr.metric,
         qr.period,
         coalesce(u.cnt, 0) as used,
         qr.max_count,
         case when qr.max_count < 0 then -1
              else greatest(qr.max_count - coalesce(u.cnt, 0), 0) end as remaining
  from public.quota_rules(v_plan) qr
  left join lateral (
    select case when uc.bucket = public.current_bucket(qr.period)
                then uc.count else 0 end as cnt
    from public.usage_counters uc
    where uc.user_id = v_uid and uc.metric = qr.metric and uc.period = qr.period
  ) u on true;
end;
$$;

grant execute on function public.get_usage() to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 8) Storage: bucket privado "media" (id = name = "media", public = false).
--    Objetos (arquivos) sao dados e nao fazem parte deste schema.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 9) Politicas RLS do Storage: cada usuario so acessa objetos sob o proprio
--    prefixo "{auth.uid()}/{deck_id}/{filename}" no bucket "media".
--    (storage.foldername(name))[1] e o primeiro segmento do caminho.
-- ----------------------------------------------------------------------------
drop policy if exists "kioku media read own" on storage.objects;
create policy "kioku media read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kioku media insert own" on storage.objects;
create policy "kioku media insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kioku media update own" on storage.objects;
create policy "kioku media update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kioku media delete own" on storage.objects;
create policy "kioku media delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ----------------------------------------------------------------------------
-- deck_counts(): per-deck card counts for the signed-in user in ONE round trip
-- (replaces the old N x 5 per-deck HEAD count requests on the deck list / Home).
-- Returns one row per deck that HAS cards; a deck with zero cards is simply
-- absent (the client treats a missing deck id as all-zeros).
--
--   new_count        = Anki "new cards to show today" (see below) — NOT the raw
--                      count of state='new'
--   learning_count   = cards in 'learning' or 'relearning' (any due time)
--   due_review_count = 'review' cards whose due has arrived (due <= now())
--   due_any_count    = ALL cards whose due has arrived (any state)
--   total_count      = all cards in the deck
--
-- new_count = greatest(0, least(new_per_day - new_studied_today, total_new)),
-- the per-deck daily new-card limit (decks.new_per_day; 0 = show no new cards),
-- where new_studied_today = review_logs for this deck/user with prev_state='new'
-- whose reviewed_at falls on "today" in America/Sao_Paulo (same boundary as the
-- streak AND the review queue, so the badge and the session never diverge).
-- "Unlimited" new_per_day (the 1e9 sentinel) naturally yields total_new.
--
-- "due" is an ABSOLUTE-INSTANT comparison (due <= now()) — timezone-agnostic,
-- since due and now() are both timestamptz. security invoker + RLS on
-- public.cards scopes rows to the caller; the explicit user_id = auth.uid() is
-- belt-and-suspenders and lets it use the cards indexes.
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
      -- UNLIMITED new (the >= 1e9 sentinel): show ALL remaining new cards, like
      -- Anki, even past the client's session cap. total_new = count(state='new'),
      -- which already EXCLUDES today's studied new cards (they left the 'new'
      -- state), so it is the true "total minus studied today" remaining — no
      -- second subtraction (that would under-count).
      when d.new_per_day >= 1000000000 then cc.total_new
      -- Finite limit: Anki "new to show today" = clamp(new_per_day - studied, 0, total_new).
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

-- Fim do schema consolidado.
