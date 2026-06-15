-- ============================================================================
-- Kioku: limites de uso (modelo freemium). ETAPA 1 - fundacao no banco.
--
-- Rode UMA vez em um banco existente (Supabase hospedado ou self-hosted), como
-- um papel privilegiado (postgres / service_role no SQL editor). Idempotente
-- (add column if not exists, create ... if not exists, create or replace,
-- drop policy if exists antes de create).
--
-- O MESMO conteudo esta embutido em db/full-schema.sql (setup do zero); este
-- arquivo aplica so a parte de limites a um banco que ja tem as outras tabelas.
--
-- Cria:
--   - profiles.plan                         (free | basic | advanced; def. free)
--   - public.usage_counters                 (contadores por usuario/metrica/periodo, RLS)
--   - public.quota_rules(plan)              -> limites (FONTE UNICA no SQL)
--   - public.current_bucket(period)         -> chave do periodo atual (UTC)
--   - public.consume_quota(metric, period)  -> incrementa e diz se PODE (atomico)
--   - public.get_usage()                    -> uso atual (sem incrementar)
--
-- Os limites ficam em quota_rules() e estao espelhados em
-- src/features/usage/limits.ts. Mude nos DOIS lugares.
--
-- Pre-requisitos (ja presentes numa instalacao padrao): schema auth, tabela
-- auth.users, funcao auth.uid(), papeis anon / authenticated / service_role.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Coluna plan em profiles. O sistema de cobranca vai alternar isso depois;
--    por enquanto entra como 'free' e voce ajusta o seu na mao para testar.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan text default 'free' not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan = any (array['free'::text, 'basic'::text, 'advanced'::text]));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 2) Tabela de contadores: uma linha por (usuario, metrica, periodo). O campo
--    bucket guarda a "fatia" atual ('YYYY-MM-DD' p/ dia, 'YYYY-MM' p/ mes); o
--    reset preguicoso zera count quando o bucket vira.
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

-- Leitura apenas do dono. NAO ha policy de insert/update/delete de proposito:
-- a escrita so acontece pelas funcoes SECURITY DEFINER abaixo, entao o cliente
-- nao consegue zerar nem mexer no proprio contador (tamper-proof).
drop policy if exists "uso próprio (leitura)" on public.usage_counters;
create policy "uso próprio (leitura)" on public.usage_counters
  for select using (auth.uid() = user_id);

grant select on table public.usage_counters to authenticated;
grant all    on table public.usage_counters to service_role;


-- ----------------------------------------------------------------------------
-- 3) Limites por plano: FONTE UNICA no SQL. Espelhe qualquer mudanca em
--    src/features/usage/limits.ts.
--      max_count = -1  -> ilimitado: sempre permite, nem mede.
--      max_count =  0  -> sempre nega (ex.: imagens no plano free).
--      max_count >  0  -> teto por periodo.
--    O periodo (day/month) faz parte da regra: free e diario; pagos sao mensais.
-- ----------------------------------------------------------------------------
create or replace function public.quota_rules(p_plan text)
returns table(metric text, period text, max_count integer)
language sql
immutable
as $$
  select r.metric, r.period, r.max_count
  from (values
    -- plano       metrica     periodo   teto
    ('free',     'deckGen',  'day',       6),
    ('free',     'tutor',    'day',      20),
    ('free',     'image',    'month',     0),
    ('free',     'audio',    'month',   500),
    ('basic',    'deckGen',  'month',   300),
    ('basic',    'tutor',    'month',  1000),
    ('basic',    'image',    'month',   100),
    ('basic',    'audio',    'month',    -1),
    ('advanced', 'deckGen',  'month',  1000),
    ('advanced', 'tutor',    'month',  5000),
    ('advanced', 'image',    'month',   300),
    ('advanced', 'audio',    'month',    -1)
  ) as r(plan, metric, period, max_count)
  where r.plan = p_plan;
$$;

grant execute on function public.quota_rules(text) to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4) Chave do periodo atual, em UTC. Troque 'utc' por 'America/Sao_Paulo' nos
--    dois ramos se quiser que o "dia" vire a meia-noite de Brasilia.
-- ----------------------------------------------------------------------------
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


-- ----------------------------------------------------------------------------
-- 5) consume_quota: registra 1 uso e responde se a acao e permitida.
--
--    Atomico e a prova de corrida: o INSERT ... ON CONFLICT DO UPDATE trava a
--    linha do contador ate o fim da transacao, entao chamadas simultaneas
--    serializam e ninguem ultrapassa o teto por corrida.
--
--    O periodo e o teto efetivos vem SEMPRE do plano (quota_rules), nunca do
--    p_period recebido: assim um usuario free nao burla o limite diario pedindo
--    uma checagem 'month'. p_period e aceito so para manter a assinatura pedida.
-- ----------------------------------------------------------------------------
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

  -- metrica nao gerida por este plano -> libera (nada a medir)
  if v_period is null then
    return query select true, 0, -1, coalesce(p_period, 'day');
    return;
  end if;

  -- ilimitado -> libera sem medir
  if v_limit < 0 then
    return query select true, 0, -1, v_period;
    return;
  end if;

  -- teto zero -> sempre nega (ex.: imagens no plano free)
  if v_limit = 0 then
    return query select false, 0, 0, v_period;
    return;
  end if;

  v_bucket := public.current_bucket(v_period);

  -- garante a linha + reset preguicoso (zera se o bucket virou) e trava a linha
  -- ate o commit. Sem incrementar ainda: primeiro a gente confere o teto.
  -- Alias `uc` + colunas qualificadas: o nome de coluna "period" colidiria com
  -- a coluna de saida "period" do RETURNS TABLE (variavel implicita do PL/pgSQL).
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


-- ----------------------------------------------------------------------------
-- 6) get_usage: uso atual de TODAS as metricas do plano do usuario, sem
--    incrementar. Aplica o reset preguicoso na leitura (count antigo conta 0).
--    remaining = -1 quando ilimitado.
-- ----------------------------------------------------------------------------
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

-- Fim dos limites de uso.
