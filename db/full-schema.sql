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
    settings jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    constraint profiles_pkey primary key (id),
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

-- Fim do schema consolidado.
