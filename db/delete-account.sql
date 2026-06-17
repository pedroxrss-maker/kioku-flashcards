-- Exclusão de conta (IRREVERSÍVEL). RPC SECURITY DEFINER que o próprio usuário
-- autenticado chama para apagar a PRÓPRIA conta e todos os seus dados.
--
-- ===========================================================================
-- DONO = supabase_auth_admin. O SECURITY DEFINER faz a função rodar como o dono;
-- como auth.users pertence ao supabase_auth_admin, só esse dono consegue deletar
-- de auth.users. A linha `alter function ... owner to supabase_auth_admin` abaixo
-- garante isso (idempotente nas re-execuções).
--
-- Rode no SQL editor do Supabase (como postgres). O postgres é membro de
-- supabase_auth_admin (a troca de dono anterior já provou isso), então pode
-- (re)criar e reasaltar o dono desta função.
-- ===========================================================================
--
-- MÍDIA / STORAGE: esta função NÃO toca em storage.objects. O Supabase PROÍBE
-- DELETE direto nas tabelas de storage via SQL ("Direct deletion from storage
-- tables is not allowed. Use the Storage API instead."). A limpeza de mídia é
-- feita pelo CLIENTE, via Storage API (como `authenticated`, permitido pela
-- policy "kioku media delete own"), ANTES de chamar esta RPC (ver
-- src/features/account/deleteAccount.ts, passo (b)).
--
-- SEGURANÇA:
--   - SEM parâmetros: usa apenas auth.uid(). Jamais recebe um id de usuário,
--     então um usuário NUNCA consegue excluir a conta de outro.
--   - Guarda de plano pago: se profiles.plan for 'basic'/'advanced', LEVANTA
--     exceção e não apaga nada (o usuário deve cancelar a assinatura na Kiwify
--     primeiro; o webhook devolve o plano para 'free' e aí a exclusão libera).
--
-- O QUE APAGA:
--   - public.pending_plans (chave = email, SEM cascade) -> apagado por email.
--   - auth.users do usuário -> CASCATA para profiles, decks, cards, review_logs,
--     gamification, achievement_unlocks, usage_counters (todas FK ON DELETE
--     CASCADE) e para auth.* (identities, sessions, refresh_tokens...).
--
-- Idempotente (create or replace + grants). Revogada de public/anon; execute só
-- para authenticated.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_plan  text;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;

  -- Guarda (defesa em profundidade): nunca excluir uma conta com plano PAGO.
  select plan into v_plan from public.profiles where id = v_uid;
  if v_plan in ('basic', 'advanced') then
    raise exception 'plano ativo: cancele a assinatura na Kiwify antes de excluir a conta';
  end if;

  -- pending_plans é por email (sem FK/cascade): remove qualquer plano estacionado.
  select email into v_email from auth.users where id = v_uid;
  if v_email is not null then
    delete from public.pending_plans where email = lower(v_email);
  end if;

  -- O delete principal: CASCATA para todas as tabelas public do usuário + auth.*.
  -- (A mídia em Storage é removida pelo CLIENTE via Storage API antes desta RPC.)
  delete from auth.users where id = v_uid;
end;
$$;

-- O DONO precisa poder deletar de auth.users. Idempotente em re-execução
-- (no-op quando a função já é de supabase_auth_admin).
alter function public.delete_my_account() owner to supabase_auth_admin;

-- ...e alcançar as tabelas public que a função lê/apaga:
grant usage          on schema public        to supabase_auth_admin;
grant select         on public.profiles      to supabase_auth_admin;
grant select, delete on public.pending_plans to supabase_auth_admin;

-- Só o usuário logado chama para si mesmo. Nunca anon/public.
revoke all     on function public.delete_my_account() from public;
revoke all     on function public.delete_my_account() from anon;
grant  execute on function public.delete_my_account() to authenticated;
