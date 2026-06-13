-- ============================================================================
-- Kioku: gamificação (XP / nível por usuário + histórico de conquistas).
--
-- Rode UMA vez em um banco existente (Supabase hospedado ou self-hosted), como
-- um papel privilegiado (postgres / service_role no SQL editor). Idempotente
-- (create ... if not exists, drop policy if exists antes de create).
--
-- O MESMO conteudo esta embutido em db/full-schema.sql (setup do zero); este
-- arquivo aplica so a parte de gamificação a um banco que ja tem as outras
-- tabelas.
--
-- Pre-requisitos (ja presentes numa instalacao padrao): schema auth, tabela
-- auth.users, funcao auth.uid(), papeis anon / authenticated / service_role, e
-- gen_random_uuid() (Postgres 13+).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabelas
--    gamification: uma linha por usuario (estado de XP/nivel).
--    achievement_unlocks: uma linha por conquista desbloqueada (historico).
-- ----------------------------------------------------------------------------
create table if not exists public.gamification (
    user_id    uuid not null,
    total_xp   integer default 0 not null,
    level      integer default 1 not null,
    updated_at timestamp with time zone default now() not null,
    constraint gamification_pkey primary key (user_id),
    constraint gamification_user_id_fkey foreign key (user_id)
        references auth.users(id) on delete cascade,
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
    constraint achievement_unlocks_user_id_fkey foreign key (user_id)
        references auth.users(id) on delete cascade
);

-- ----------------------------------------------------------------------------
-- 2) Indice (alem dos criados pelas chaves)
-- ----------------------------------------------------------------------------
create index if not exists idx_achievement_unlocks_user
    on public.achievement_unlocks using btree (user_id, unlocked_at);

-- ----------------------------------------------------------------------------
-- 3) Row Level Security: cada usuario so le/grava o que e dele (mesmo padrao
--    de decks/cards/review_logs).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4) GRANTs (o RLS acima filtra as linhas por usuario)
-- ----------------------------------------------------------------------------
grant all on table public.gamification        to anon, authenticated, service_role;
grant all on table public.achievement_unlocks to anon, authenticated, service_role;

-- Fim da gamificação.
