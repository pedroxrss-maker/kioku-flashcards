-- Exclusão de conta (IRREVERSÍVEL). RPC SECURITY DEFINER que o próprio usuário
-- autenticado chama para apagar a PRÓPRIA conta e todos os seus dados.
--
-- ===========================================================================
-- IMPORTANTE: crie esta função como o papel POSTGRES (rode no SQL editor do
-- Supabase, que executa como postgres). O SECURITY DEFINER faz a função rodar
-- como o DONO; só assim ela pode deletar de auth.users. Se for criada por um
-- papel sem permissão em auth.users, o delete final falha.
-- ===========================================================================
--
-- SEGURANÇA:
--   - SEM parâmetros: usa apenas auth.uid(). Jamais recebe um id de usuário,
--     então um usuário NUNCA consegue excluir a conta de outro.
--   - Guarda de plano pago: se profiles.plan for 'basic'/'advanced', LEVANTA
--     exceção e não apaga nada (o usuário deve cancelar a assinatura na Kiwify
--     primeiro, para não continuar sendo cobrado; o webhook devolve o plano para
--     'free' e aí a exclusão fica liberada).
--
-- O QUE APAGA:
--   - public.pending_plans (chave = email, SEM cascade) -> apagado por email.
--   - storage.objects do bucket 'media' do usuário (backstop; o cliente já
--     remove os arquivos físicos via Storage API ANTES de chamar esta função).
--   - auth.users do usuário -> CASCATA para profiles, decks, cards, review_logs,
--     gamification, achievement_unlocks, usage_counters (todas FK ON DELETE
--     CASCADE) e para auth.* (identities, sessions, refresh_tokens...).
--
-- Idempotente (create or replace). Revogada de public/anon; execute só para
-- authenticated.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
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

  -- Backstop de Storage: remove as LINHAS das mídias deste usuário no bucket
  -- 'media' (o cliente remove os arquivos físicos via Storage API antes da RPC).
  delete from storage.objects
    where bucket_id = 'media'
      and (storage.foldername(name))[1] = v_uid::text;

  -- O delete principal: CASCATA para todas as tabelas public do usuário + auth.*.
  delete from auth.users where id = v_uid;
end;
$$;

-- Só o usuário logado pode chamar para si mesmo. Nunca anon/public.
revoke all     on function public.delete_my_account() from public;
revoke all     on function public.delete_my_account() from anon;
grant  execute on function public.delete_my_account() to authenticated;
