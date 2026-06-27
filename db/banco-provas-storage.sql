-- ============================================================================
-- Kioku: leitura das IMAGENS DO BANCO DE QUESTÕES no Storage (bucket "media",
-- prefixo "banco-provas/").
--
-- Estas imagens são CONTEÚDO DO APP (figuras/gráficos/mapas das questões de
-- vestibular), NÃO dado de usuário. Mesmo modelo da tabela public.questions:
--   - QUALQUER usuário autenticado pode LER os objetos sob "banco-provas/".
--   - Ninguém (anon/authenticated) ESCREVE pelo cliente: NÃO há policy de
--     insert/update/delete para esse prefixo. Só o service_role (que ignora
--     RLS) grava — pela ingestão/curadoria do conteúdo (script com a SECRET key).
--
-- O bucket "media" CONTINUA PRIVADO (public = false). Os arquivos por usuário
-- ("{auth.uid()}/...": áudio/imagem dos cards) seguem protegidos pelas policies
-- "kioku media * own" (ver db/storage-setup.sql) — esta policy só adiciona
-- leitura ao prefixo de conteúdo do app, sem afetar as demais.
--
-- Leitura no app: bucket privado => usar o endpoint AUTENTICADO (JWT do usuário),
-- via supabase-js storage.from('media').download('banco-provas/<arquivo>') ou
-- createSignedUrl('banco-provas/<arquivo>', ...). NÃO funciona por URL pública
-- (isso exigiria bucket público, o que exporia os arquivos por usuário).
--
-- Caminho do objeto: "banco-provas/<imagem_path>", onde <imagem_path> é o nome
-- do arquivo guardado na coluna questions.imagem_path (ex.: "enem_2022_q07.png").
-- O app prefixa "banco-provas/" ao montar o caminho do Storage.
--
-- Rode UMA vez no SQL editor do Supabase como papel privilegiado (postgres /
-- service_role). Idempotente (drop policy if exists antes de create).
-- Pré-requisitos: bucket "media" já criado (db/storage-setup.sql) e RLS
-- habilitado em storage.objects (instalação padrão do Supabase).
-- ============================================================================

-- SELECT: qualquer usuário autenticado lê objetos do bucket "media" cujo
-- primeiro segmento do caminho é "banco-provas". (storage.foldername(name))[1]
-- é a primeira pasta da chave do objeto; para "banco-provas/enem_2022_q07.png"
-- vale "banco-provas". NÃO criamos insert/update/delete: sem essas policies, o
-- RLS nega toda escrita do cliente, e só o service_role grava o conteúdo.
drop policy if exists "banco-provas legivel (autenticado)" on storage.objects;
create policy "banco-provas legivel (autenticado)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'banco-provas'
  );

-- Fim das policies de leitura do banco de questões no Storage.
