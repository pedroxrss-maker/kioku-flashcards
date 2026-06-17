-- LGPD: trava de integridade da prova de consentimento (camada de banco).
--
-- Torna privacy_consent_at e privacy_consent_version "write-once / service-only":
-- so o service_role e funcoes SECURITY DEFINER (o trigger handle_new_user, no
-- cadastro) podem grava-los. Qualquer tentativa do CLIENTE (authenticated/anon)
-- de ALTERAR esses dois campos via UPDATE e BLOQUEADA.
--
-- NAO trava: marketing_consent e marketing_consent_at (o dono precisa poder
-- optar/desoptar do marketing) nem phone (o dono pode atualizar o telefone).
--
-- ABORDAGEM: trigger IRMAO e independente do guard_profile_plan
-- (db/pending-plans.sql), em vez de estender aquele. Motivo: separa as
-- responsabilidades (o guard de plan continua so sobre plan, com nome fiel) e
-- mantem este arquivo autocontido, sem reescrever o outro. Os DOIS triggers
-- BEFORE UPDATE coexistem e AMBOS rodam em cada UPDATE de profiles: o Postgres
-- dispara triggers de mesmo tipo em ordem alfabetica de nome (guard_profile_
-- consent antes de guard_profile_plan). Nenhum dos dois altera NEW (so RAISE ou
-- deixa passar), entao a ordem e indiferente; cada um protege o seu campo e, se
-- qualquer um levanta excecao, o UPDATE inteiro aborta.
--
-- INSERT nao e vetor: a linha de profiles e criada pelo trigger handle_new_user
-- no cadastro, e a PK (id) impede um segundo INSERT pelo cliente. Por isso, assim
-- como o guard de plan, esta trava cobre apenas UPDATE.
--
-- ORDEM DE EXECUCAO: rode db/lgpd-consent.sql PRIMEIRO (ele cria as colunas
-- privacy_consent_at / privacy_consent_version que este trigger referencia). Sem
-- as colunas, todo UPDATE em profiles quebraria. Depois rode ESTE arquivo.
--
-- Idempotente (create or replace + drop trigger if exists). Rode no SQL editor do
-- Supabase como papel privilegiado (postgres).

begin;

-- INVOKER (default) DE PROPOSITO: o trigger precisa enxergar o papel REAL de quem
-- executa o UPDATE (current_user). Se fosse SECURITY DEFINER, current_user viraria
-- o dono da funcao e a checagem por papel nao funcionaria.
create or replace function public.guard_profile_consent()
returns trigger
language plpgsql
as $$
begin
  if (new.privacy_consent_at is distinct from old.privacy_consent_at)
     or (new.privacy_consent_version is distinct from old.privacy_consent_version) then
    -- service_role e os papeis de funcoes SECURITY DEFINER (ex.: postgres) passam;
    -- so o cliente logado/anonimo e bloqueado.
    if current_user in ('authenticated', 'anon') then
      raise exception 'alteracao da prova de consentimento de privacidade nao permitida pelo cliente';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_consent on public.profiles;
create trigger guard_profile_consent
  before update on public.profiles
  for each row execute function public.guard_profile_consent();

commit;

-- Verificacao opcional: confirma que os DOIS guards estao ativos em profiles.
--   select tgname
--   from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and not tgisinternal
--   order by tgname;
-- Esperado conter: guard_profile_consent, guard_profile_plan.
