-- Kiwify webhook -> plano do usuario.
--
-- Resolve o EMAIL do comprador (Kiwify) para o auth.users.id e atualiza
-- public.profiles.plan. Chamada pelo Worker workers/kiwify-webhook via
--   POST {SUPABASE_URL}/rest/v1/rpc/set_plan_by_email  { p_email, p_plan }
-- usando a SECRET key (service role).
--
-- SECURITY DEFINER porque o service role nao le auth.users diretamente; a funcao
-- roda como o dono (postgres), que le. Retorna quantas linhas de profiles foram
-- atualizadas (0 = nenhum usuario com esse email).
--
-- REQUER a tabela public.pending_plans: rode db/pending-plans.sql ANTES deste
-- arquivo (o Postgres valida o corpo da funcao na criacao e a tabela precisa
-- existir). Idempotente (create or replace). Aplique no SQL editor do Supabase.
--
-- RECONCILIACAO (pagar antes de ter conta): quando NAO ha usuario com o email
-- (pagou antes de criar conta, ou email diferente), em vez de so retornar 0, a
-- funcao ESTACIONA o plano pago (basic/advanced) em pending_plans, para
-- auto-aplicar quando o usuario entrar (ver apply_pending_plan). Para 'free' sem
-- usuario, apaga qualquer pending. Continua idempotente.

create or replace function public.set_plan_by_email(p_email text, p_plan text)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_count integer;
begin
  if p_plan not in ('free', 'basic', 'advanced') then
    raise exception 'plano invalido: %', p_plan;
  end if;

  select id into v_uid
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  if v_uid is null then
    -- Sem conta ainda: lembra o plano PAGO para aplicar quando o usuario entrar.
    if p_plan in ('basic', 'advanced') then
      insert into public.pending_plans as pp (email, plan)
      values (lower(p_email), p_plan)
      on conflict (email) do update
        set plan = excluded.plan, updated_at = now();
    else
      -- Downgrade (free) para conta inexistente: descarta o pending, se houver.
      delete from public.pending_plans where email = lower(p_email);
    end if;
    return 0; -- nenhum usuario com esse email (plano tratado em pending_plans)
  end if;

  update public.profiles set plan = p_plan where id = v_uid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- So o service role (o Worker) pode executar. NUNCA exponha ao cliente.
revoke all on function public.set_plan_by_email(text, text) from public;
revoke all on function public.set_plan_by_email(text, text) from anon, authenticated;
grant execute on function public.set_plan_by_email(text, text) to service_role;
