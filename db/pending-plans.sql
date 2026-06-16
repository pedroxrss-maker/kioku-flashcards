-- Pending plans  (reconciliacao "pagar antes de ter conta").
--
-- Quando a Kiwify aprova uma compra para um email que ainda NAO tem conta no
-- Kioku (ou com email de caixa/maiusculas diferente), o webhook nao acha o
-- usuario. Em vez de perder o plano pago, ele fica "estacionado" nesta tabela
-- (pela funcao set_plan_by_email, ver db/set-plan-by-email.sql). Quando o
-- usuario se autentica, o app chama apply_pending_plan(), que move o plano para
-- o profile dele e apaga a linha. Resultado: ninguem fica pago-sem-acesso, e a
-- correcao e automatica, sem trabalho manual.
--
-- ORDEM DE EXECUCAO: rode ESTE arquivo PRIMEIRO; depois db/set-plan-by-email.sql
-- (a funcao de la referencia public.pending_plans). Tudo idempotente.
--
-- ===========================================================================
-- TAMPER-PROOF (resumo): um usuario NUNCA consegue se dar um plano pago.
--   1) pending_plans: RLS ligado, SEM policy de cliente -> so o service role e
--      as funcoes SECURITY DEFINER leem/escrevem. O unico jeito de um par
--      (email -> plano) entrar aqui e via set_plan_by_email, que so o service
--      role (o Worker da Kiwify) pode chamar. Ou seja: so entra o que foi PAGO.
--   2) apply_pending_plan(): NAO recebe plano como parametro. Aplica apenas o
--      plano ja registrado em pending_plans para o email do PROPRIO usuario
--      logado (auth.uid()). O usuario nao escolhe nada.
--   3) Trava no profiles (trigger guard_profile_plan): mesmo com a policy
--      "perfil proprio" deixando o usuario editar a propria linha, o trigger
--      BLOQUEIA qualquer mudanca em profiles.plan vinda do cliente
--      (authenticated/anon). So o service role e funcoes SECURITY DEFINER
--      (rodando como dono) mudam o plano. Fecha o furo de um update direto
--      `update profiles set plan='advanced'` pelo REST.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Tabela pending_plans
-- ---------------------------------------------------------------------------
create table if not exists public.pending_plans (
  email      text        primary key,
  plan       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_plans_plan_check check (plan in ('basic', 'advanced')),
  -- A PK e sempre o email em MINUSCULAS (todas as escritas usam lower()).
  constraint pending_plans_email_lower_check check (email = lower(email))
);

alter table public.pending_plans enable row level security;

-- Sem policy de proposito: o cliente nao le nem escreve. So o service role
-- (ignora RLS) e as funcoes SECURITY DEFINER (rodam como dono) tocam aqui.
-- Mesmo padrao tamper-proof de usage_counters, porem aqui nem leitura o cliente
-- tem (a leitura acontece dentro de apply_pending_plan).
revoke all on table public.pending_plans from anon, authenticated;
grant  all on table public.pending_plans to service_role;


-- ---------------------------------------------------------------------------
-- 2) apply_pending_plan(): roda para o usuario LOGADO (auth.uid()). Acha o
--    email dele em auth.users, procura um plano estacionado para esse email
--    (em minusculas) e, se houver, seta profiles.plan e remove a linha. Retorna
--    o plano aplicado ou null (null quando nao ha nada pendente -> barato/seguro
--    de chamar em todo load autenticado).
--
--    SEGURO para o proprio usuario chamar: nao recebe parametro de plano, so
--    aplica o que o service role JA registrou como pago para o email DELE.
-- ---------------------------------------------------------------------------
create or replace function public.apply_pending_plan()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_plan  text;
  v_count integer;
begin
  if v_uid is null then
    return null; -- nao autenticado
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    return null;
  end if;

  select plan into v_plan
  from public.pending_plans
  where email = lower(v_email);

  if v_plan is null then
    return null; -- nada estacionado para este email
  end if;

  update public.profiles set plan = v_plan where id = v_uid;
  get diagnostics v_count = row_count;

  -- So consome o pending depois de aplicar de fato (o profile ja existe). Se o
  -- profile ainda nao existir (corrida no signup), mantem a linha para a
  -- proxima chamada, sem perder o plano pago.
  if v_count > 0 then
    delete from public.pending_plans where email = lower(v_email);
    return v_plan;
  end if;

  return null;
end;
$$;

-- Seguro para o usuario logado chamar para si mesmo (so aplica o que foi pago).
revoke all     on function public.apply_pending_plan() from public;
grant  execute on function public.apply_pending_plan() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3) Trava tamper-proof em profiles.plan
--    A policy "perfil proprio" permite o usuario editar a PROPRIA linha de
--    profiles (nome, settings...). Sem esta trava, ele tambem poderia mandar
--    `update profiles set plan='advanced'` pelo REST e se dar um plano pago.
--    Este trigger bloqueia QUALQUER mudanca de plan vinda do cliente
--    (authenticated/anon). So o service role e funcoes SECURITY DEFINER
--    (set_plan_by_email, apply_pending_plan) podem mudar o plano.
--
--    Importante: o app nunca escreve profiles.plan pelo cliente (so
--    display_name/daily_goal/settings), entao esta trava nao quebra nada.
--    INVOKER (default) de proposito: o trigger precisa enxergar o papel REAL de
--    quem executa o UPDATE (current_user), nao o dono.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_plan()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan then
    if current_user in ('authenticated', 'anon') then
      raise exception 'mudanca de plano nao permitida pelo cliente';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_plan on public.profiles;
create trigger guard_profile_plan
  before update on public.profiles
  for each row execute function public.guard_profile_plan();

-- Fim de pending-plans.
