-- LGPD: captura auditavel de consentimento no cadastro (camada de banco).
--
-- O QUE FAZ:
--   1) Adiciona colunas em public.profiles para guardar telefone (opcional) e a
--      prova de consentimento (privacidade + marketing) com data e versao.
--   2) Atualiza a funcao handle_new_user() (trigger on_auth_user_created em
--      auth.users) para persistir esses campos a partir de raw_user_meta_data no
--      cadastro. O cliente vai enviar esses valores via signUp(options.data), que
--      o Supabase grava em raw_user_meta_data; o trigger le e persiste.
--
-- SEGURANCA (tamper-proof, ja existente): a coluna profiles.plan continua travada
--   pelo trigger guard_profile_plan (db/pending-plans.sql), que BLOQUEIA qualquer
--   mudanca de plan vinda do cliente (authenticated/anon). Estas colunas novas NAO
--   mexem nisso: o dono pode atualizar marketing_consent (opt-out futuro), e plan
--   segue protegido. Ver a explicacao no fim deste arquivo.
--
-- Idempotente (add column if not exists, create or replace). Rode no SQL editor
-- do Supabase, como papel privilegiado (postgres). Tudo numa transacao.

begin;

-- ---------------------------------------------------------------------------
-- 1) Colunas novas em public.profiles
--    - phone: opcional, nullable.
--    - privacy_consent_at / _version: quando e qual versao da politica foi aceita.
--    - marketing_consent: opt-in de marketing (NOT NULL default false -> usuarios
--      existentes ficam como "nao optaram").
--    - marketing_consent_at: quando optou (null se nunca optou).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone                   text,
  add column if not exists privacy_consent_at      timestamptz,
  add column if not exists privacy_consent_version text,
  add column if not exists marketing_consent       boolean not null default false,
  add column if not exists marketing_consent_at    timestamptz;

-- ---------------------------------------------------------------------------
-- 2) handle_new_user(): mantem a logica de display_name e passa a persistir os
--    novos campos do raw_user_meta_data. SECURITY DEFINER (insere em profiles com
--    RLS ligado). ROBUSTA: cada cast fica em bloco exception, entao um valor
--    ausente ou malformado NUNCA derruba o cadastro (cai no default seguro).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_meta          jsonb       := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_consent_flag  boolean     := false;
  v_consent_given boolean     := false;
  v_consent_at    timestamptz := null;
  v_marketing     boolean     := false;
begin
  -- Flag opcional de consentimento de privacidade (tolerante a valor ruim/ausente).
  begin
    v_consent_flag := coalesce((v_meta->>'privacy_consent')::boolean, false);
  exception when others then
    v_consent_flag := false;
  end;

  -- Consentimento de privacidade "dado" se o cadastro trouxe QUALQUER sinal disso
  -- (timestamp, versao ou a flag). A aceitacao da politica e OBRIGATORIA no
  -- cadastro (garantida pela UI), entao na pratica sempre vem. O caso contrario
  -- existe so para nao FABRICAR consentimento se nada veio (fica null).
  v_consent_given := (v_meta ? 'privacy_consent_at')
                  or (v_meta ? 'privacy_consent_version')
                  or v_consent_flag;

  if v_consent_given then
    -- Usa o timestamp enviado, se parseavel; senao carimba a hora do servidor.
    begin
      v_consent_at := coalesce(nullif(v_meta->>'privacy_consent_at', '')::timestamptz, now());
    exception when others then
      v_consent_at := now();
    end;
  end if;
  -- (senao: v_consent_at permanece null)

  -- marketing_consent: parse tolerante, default false.
  begin
    v_marketing := coalesce((v_meta->>'marketing_consent')::boolean, false);
  exception when others then
    v_marketing := false;
  end;

  insert into public.profiles (
    id,
    display_name,
    phone,
    privacy_consent_at,
    privacy_consent_version,
    marketing_consent,
    marketing_consent_at
  )
  values (
    new.id,
    coalesce(nullif(v_meta->>'display_name', ''), 'Estudante'),
    nullif(v_meta->>'phone', ''),
    v_consent_at,
    nullif(v_meta->>'privacy_consent_version', ''),
    v_marketing,
    case when v_marketing then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- O trigger on_auth_user_created (after insert on auth.users) JA existe e chama
-- esta funcao; "create or replace function" acima ja atualiza o comportamento,
-- entao nao e preciso recriar o trigger.

commit;

-- Verificacao opcional (rode separado depois):
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--   order by ordinal_position;
