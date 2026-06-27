-- ============================================================================
-- Kioku: banco de questoes (feature vestibular).
--
-- IMPORTANTE: esta tabela e CONTEUDO DO APP, nao dado de usuario. Logo:
--   - QUALQUER usuario autenticado pode LER (select).
--   - Ninguem (anon/authenticated) pode ESCREVER pelo cliente: NAO ha policy de
--     insert/update/delete. So o service_role (que ignora RLS) grava — pela
--     ingestao/curadoria do conteudo (script/admin com a SECRET key).
--
-- Rode UMA vez em um banco existente (Supabase hospedado ou self-hosted), como
-- um papel privilegiado (postgres / service_role no SQL editor). Idempotente
-- (create table if not exists, create index if not exists, drop policy if exists
-- antes de create). Pre-requisitos: schema auth, auth.uid()/auth.role(), papeis
-- anon / authenticated / service_role (instalacao padrao do Supabase).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Tabela public.questions: uma linha por questao de prova.
--    alternativas: array JSON de objetos {letra, texto}, ex.:
--      [{"letra":"A","texto":"..."}, {"letra":"B","texto":"..."}]
--    gabarito: a LETRA correta (ex.: 'C'). fonte: string pronta p/ citar
--    (ex.: 'ENEM 2019').
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
    id           uuid        primary key default gen_random_uuid(),
    vestibular   text        not null,
    ano          integer     not null,
    disciplina   text        not null,
    topico       text        not null,
    enunciado    text        not null,
    alternativas jsonb       not null default '[]'::jsonb,
    gabarito     text        not null,
    fonte        text        not null,
    created_at   timestamptz not null default now(),
    constraint questions_vestibular_check
      check (vestibular = any (array['enem'::text, 'fuvest'::text, 'unicamp'::text, 'unesp'::text]))
);

-- imagem_path: caminho no bucket 'media' do Storage para a figura/grafico/imagem
-- da questao (extraida da prova), ou NULL quando a questao e so texto. Adicionado
-- via alter idempotente para nao quebrar bancos que ja criaram a tabela antes.
alter table public.questions add column if not exists imagem_path text;

-- anulada: TRUE para questoes anuladas pela banca (sem resposta correta). Mantem
-- enunciado/alternativas, mas gabarito fica vazio e a guarda de gabarito e pulada
-- (ver trigger abaixo). Default false; alter idempotente.
alter table public.questions add column if not exists anulada boolean not null default false;


-- ----------------------------------------------------------------------------
-- 2) Indices para as consultas do menu (filtro por vestibular + disciplina +
--    topico, e a contagem por disciplina/topico).
-- ----------------------------------------------------------------------------
create index if not exists idx_questions_vest_disc_topico
  on public.questions using btree (vestibular, disciplina, topico);

create index if not exists idx_questions_disc_topico
  on public.questions using btree (disciplina, topico);


-- ----------------------------------------------------------------------------
-- 3) RLS: leitura liberada para autenticados; escrita SO pelo service_role.
-- ----------------------------------------------------------------------------
alter table public.questions enable row level security;

-- SELECT: qualquer usuario autenticado. (auth.role() = 'authenticated' cobre o
-- caso normal; o OR auth.uid() is not null e um cinto-e-suspensorio.) NAO ha
-- policy de insert/update/delete de proposito: sem ela, RLS nega toda escrita do
-- cliente, e so o service_role (que ignora RLS) grava o conteudo.
drop policy if exists "questoes legiveis (autenticado)" on public.questions;
create policy "questoes legiveis (autenticado)" on public.questions
  for select
  using (auth.role() = 'authenticated' or auth.uid() is not null);

-- GRANTs: o papel do usuario logado le; o service_role faz tudo (ingestao).
-- Sem grant para anon: visitante deslogado nem le. O RLS acima e a regra fina;
-- o grant e a regra grossa (a tabela so e alcancavel por quem listamos aqui).
grant select on table public.questions to authenticated;
grant all    on table public.questions to service_role;


-- ----------------------------------------------------------------------------
-- 4) Guarda de integridade: o gabarito tem que ser uma das LETRAS das
--    alternativas. Pula a checagem quando a questao e ANULADA (sem resposta) OU
--    quando NAO ha alternativas (ex.: dissertativas) — nesses casos qualquer
--    gabarito vale, inclusive vazio.
--    BEFORE INSERT OR UPDATE; idempotente (create or replace + drop trigger).
-- ----------------------------------------------------------------------------
create or replace function public.questions_check_gabarito()
returns trigger
language plpgsql
as $$
begin
  -- Anulada, ou sem alternativas (null, jsonb que nao e array, ou array vazio):
  -- aceita qualquer gabarito, ate vazio (anuladas / dissertativas).
  if new.anulada
     or new.alternativas is null
     or jsonb_typeof(new.alternativas) <> 'array'
     or jsonb_array_length(new.alternativas) = 0 then
    return new;
  end if;

  -- Caso contrario, gabarito precisa bater com alguma alternativas[].letra.
  if not exists (
    select 1
    from jsonb_array_elements(new.alternativas) as alt
    where upper(alt->>'letra') = upper(new.gabarito)
  ) then
    raise exception
      'gabarito % nao corresponde a nenhuma letra das alternativas (questao %)',
      new.gabarito, coalesce(new.id::text, '(novo)');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_questions_check_gabarito on public.questions;
create trigger trg_questions_check_gabarito
  before insert or update on public.questions
  for each row execute function public.questions_check_gabarito();


-- ----------------------------------------------------------------------------
-- 5) Contagem de questoes por topico (o "48 questoes" da UI). Agrupa por
--    disciplina/topico, filtrando pelo vestibular escolhido:
--
--      select disciplina, topico, count(*) as total
--      from public.questions
--      where vestibular = 'enem'
--      group by disciplina, topico
--      order by disciplina, topico;
--
--    Para o total por disciplina (somando os topicos), basta agrupar so por
--    disciplina:
--
--      select disciplina, count(*) as total
--      from public.questions
--      where vestibular = 'enem'
--      group by disciplina
--      order by disciplina;
-- ----------------------------------------------------------------------------

-- Fim do banco de questoes.
