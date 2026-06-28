-- ============================================================================
-- Kioku: consultas de leitura do banco de questoes (Bloco 3 — menus do app).
--
-- Tres funcoes de agregacao que alimentam a navegacao: vestibulares -> disciplinas
-- -> topicos, cada nivel com a contagem de questoes.
--
-- SECURITY INVOKER (rodam como o usuario que chama), entao a RLS de
-- public.questions se aplica normalmente: so usuario AUTENTICADO recebe dados; o
-- service_role enxerga tudo. STABLE (somente leitura). Idempotentes (create or
-- replace). Contagem inclui TODAS as questoes (inclusive anuladas), de proposito.
--
-- Rode no SQL editor do Supabase. Pre-requisito: db/question-bank.sql ja aplicado.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) qb_vestibulares(): vestibulares presentes + total de questoes de cada um.
-- ----------------------------------------------------------------------------
create or replace function public.qb_vestibulares()
returns table(vestibular text, total bigint)
language sql
stable
security invoker
as $$
  select q.vestibular, count(*)::bigint as total
  from public.questions q
  group by q.vestibular
  order by q.vestibular;
$$;

grant execute on function public.qb_vestibulares() to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2) qb_disciplinas(vestibular): disciplinas presentes naquele vestibular +
--    total de questoes de cada uma.
-- ----------------------------------------------------------------------------
create or replace function public.qb_disciplinas(p_vestibular text)
returns table(disciplina text, total bigint)
language sql
stable
security invoker
as $$
  select q.disciplina, count(*)::bigint as total
  from public.questions q
  where q.vestibular = p_vestibular
  group by q.disciplina
  order by q.disciplina;
$$;

grant execute on function public.qb_disciplinas(text) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3) qb_topicos(vestibular, disciplina): topicos daquela disciplina/vestibular +
--    total de questoes de cada um (o "48 questoes" do menu), ordenado por topico.
-- ----------------------------------------------------------------------------
create or replace function public.qb_topicos(p_vestibular text, p_disciplina text)
returns table(topico text, total bigint)
language sql
stable
security invoker
as $$
  select q.topico, count(*)::bigint as total
  from public.questions q
  where q.vestibular = p_vestibular
    and q.disciplina = p_disciplina
  group by q.topico
  order by q.topico;
$$;

grant execute on function public.qb_topicos(text, text) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4) qb_questions(vestibular, disciplina, topico): as questoes COMPLETAS de um
--    topico, para alimentar a geracao de flashcards por IA. Exclui ANULADAS
--    (sem resposta correta -> inuteis p/ extrair conhecimento). Mais novas
--    primeiro (ano desc), depois por id para um desempate estavel.
-- ----------------------------------------------------------------------------
create or replace function public.qb_questions(
  p_vestibular text,
  p_disciplina text,
  p_topico text
)
returns table(enunciado text, alternativas jsonb, gabarito text, fonte text, ano integer)
language sql
stable
security invoker
as $$
  select q.enunciado, q.alternativas, q.gabarito, q.fonte, q.ano
  from public.questions q
  where q.vestibular = p_vestibular
    and q.disciplina = p_disciplina
    and q.topico = p_topico
    and q.anulada = false
  order by q.ano desc, q.id;
$$;

grant execute on function public.qb_questions(text, text, text) to authenticated, service_role;

-- Fim das consultas do banco de questoes.
