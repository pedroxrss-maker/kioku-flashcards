-- ============================================================================
-- Kioku: amizades / compartilhamento de progresso + BLOQUEIO (fundacao + RLS).
-- Sem UI. Idempotente (create ... if not exists / create or replace). Revise e
-- rode no SQL editor do Supabase. NAO envia e-mail externo ainda — so guarda o
-- convite por e-mail para virar "linkavel" quando a pessoa criar conta.
--
-- MODELO DE SEGURANCA (resumo):
--   - As tabelas-fonte (review_logs/gamification/achievement_unlocks/profiles)
--     continuam OWN-ONLY (NENHUMA policy nova as abre a terceiros).
--   - O UNICO caminho para ler progresso de outro usuario e get_friend_progress
--     (SECURITY DEFINER), que exige amizade ACEITA e NAO bloqueada, e devolve so
--     uma whitelist de campos.
--   - Escrita de amizade/bloqueio SO via funcoes SECURITY DEFINER (sem policy de
--     write). Cada funcao confere auth.uid().
--
-- BLOQUEIO (separado, DIRECIONAL): tabela friend_blocks (blocker -> blocked).
--   - Silencioso: so o bloqueador ve o proprio bloqueio (RLS). O bloqueado nunca
--     ve nada (e o block DELETA a amizade, entao para ele parece um "desfez").
--   - So bloqueia quem E amigo agora, JA FOI amigo algum dia (lapide
--     ever_friends) ou ja tem bloqueio entre voces (reciprocidade). Estranho => erro.
--   - Bloquear DESFAZ a amizade (are_friends vira false na hora). Desbloquear NAO
--     re-amiga (a amizade ja foi removida) — viram estranhos.
--   - "Lapide" ever_friends: par NAO ordenado, escrito ao ACEITAR e mantido ao
--     desfazer/bloquear. So o portao de bloqueio a le; NUNCA torna are_friends
--     true e NUNCA e exposta a clientes (interna).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) friendships: convite/amizade. requester convida; addressee aceita. Caso
--    "e-mail sem conta": addressee_id NULL + addressee_email; vira addressee_id
--    quando a pessoa entra (apply_pending_friend_invites).
-- ----------------------------------------------------------------------------
create table if not exists public.friendships (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid not null references auth.users(id) on delete cascade,
  addressee_id    uuid references auth.users(id) on delete cascade, -- null ate vincular
  addressee_email text,                                             -- so no convite por e-mail
  status          text not null default 'pending'
                    check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  updated_at      timestamptz not null default now(),

  constraint friendships_target_chk check (
    (addressee_id is not null and addressee_email is null) or
    (addressee_id is null     and addressee_email is not null)
  ),
  constraint friendships_no_self_chk
    check (addressee_id is null or addressee_id <> requester_id),
  constraint friendships_email_lower_chk
    check (addressee_email is null or addressee_email = lower(addressee_email))
);

-- UMA amizade por PAR de contas (bloqueia A->B duplicado E o reverso B->A).
create unique index if not exists friendships_pair_uniq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where addressee_id is not null;

-- UM convite-por-e-mail pendente por (requester, e-mail) enquanto sem conta.
create unique index if not exists friendships_email_uniq
  on public.friendships (requester_id, lower(addressee_email))
  where addressee_id is null;

create index if not exists idx_friendships_requester on public.friendships (requester_id);
create index if not exists idx_friendships_addressee on public.friendships (addressee_id);
create index if not exists idx_friendships_email
  on public.friendships (lower(addressee_email)) where addressee_id is null;


-- ----------------------------------------------------------------------------
-- 2) friend_blocks: bloqueio DIRECIONAL (blocker -> blocked). A->B e B->A sao
--    linhas independentes. So o blocker enxerga/gerencia o proprio bloqueio.
-- ----------------------------------------------------------------------------
create table if not exists public.friend_blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friend_blocks_no_self_chk check (blocker_id <> blocked_id),
  constraint friend_blocks_uniq unique (blocker_id, blocked_id)
);

-- Para checar o sentido reverso (alguem me bloqueou?) com indice.
create index if not exists idx_friend_blocks_blocked on public.friend_blocks (blocked_id);


-- ----------------------------------------------------------------------------
-- 2b) ever_friends: "lapide" — registra (par NAO ordenado) que dois usuarios JA
--     foram amigos ACEITOS. Sobrevive ao desfazer e ao bloquear. SERVE SO ao
--     portao de bloqueio: nunca torna are_friends true e nunca e lida por
--     clientes (RLS sem policy de select; acesso so via funcoes DEFINER).
-- ----------------------------------------------------------------------------
create table if not exists public.ever_friends (
  user_low   uuid not null references auth.users(id) on delete cascade,
  user_high  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint ever_friends_order_chk check (user_low < user_high)
);


-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------
alter table public.friendships   enable row level security;
alter table public.friend_blocks enable row level security;
alter table public.ever_friends  enable row level security;

-- friendships: cada um VE apenas as proprias relacoes (como requester ou
-- addressee). Convites-por-e-mail (addressee_id null) so o requester ve; o
-- convidado ve depois que apply_pending_friend_invites vincula o addressee_id.
drop policy if exists "friendships visiveis as partes" on public.friendships;
create policy "friendships visiveis as partes" on public.friendships
  for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- friend_blocks: SO o bloqueador ve as proprias linhas. O bloqueado NUNCA
-- enxerga (silencioso). Sem policy para o blocked_id de proposito.
drop policy if exists "bloqueios so do bloqueador" on public.friend_blocks;
create policy "bloqueios so do bloqueador" on public.friend_blocks
  for select
  using (auth.uid() = blocker_id);

-- Sem policy de INSERT/UPDATE/DELETE em nenhuma das duas: o cliente escreve SO
-- pelas funcoes SECURITY DEFINER abaixo. Revoga write como reforco.
revoke insert, update, delete on table public.friendships  from anon, authenticated;
revoke insert, update, delete on table public.friend_blocks from anon, authenticated;
grant  select on table public.friendships   to authenticated;
grant  select on table public.friend_blocks to authenticated;
grant  all    on table public.friendships   to service_role;
grant  all    on table public.friend_blocks to service_role;

-- ever_friends: INTERNA. Sem policy de select (nem o proprio par le) e sem
-- qualquer grant ao cliente. So funcoes SECURITY DEFINER (como dono) a tocam.
revoke all on table public.ever_friends from anon, authenticated;
grant  all on table public.ever_friends to service_role;


-- ----------------------------------------------------------------------------
-- 4) Helpers internos (NAO expostos ao cliente). Rodam como dono dentro das
--    funcoes DEFINER (enxergam tudo); chamados direto pelo cliente seriam
--    filtrados por RLS (inofensivos), mas revogamos por higiene.
-- ----------------------------------------------------------------------------

-- Existe linha de amizade ACEITA entre a e b? (qualquer direcao; ignora bloqueio)
create or replace function public.has_accepted_friendship(p_a uuid, p_b uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ( (f.requester_id = p_a and f.addressee_id = p_b)
         or (f.requester_id = p_b and f.addressee_id = p_a) )
  );
$$;

-- Ha bloqueio entre a e b em QUALQUER direcao?
create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.friend_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Amigos EFETIVOS = amizade aceita E sem bloqueio (qualquer direcao). E este o
-- portao usado em get_friend_progress, list_friends, etc.
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean language sql stable as $$
  select public.has_accepted_friendship(p_a, p_b) and not public.is_blocked(p_a, p_b);
$$;

-- Registra a lapide "ja foram amigos" (par nao ordenado). Idempotente.
create or replace function public.record_ever_friends(p_a uuid, p_b uuid)
returns void language sql as $$
  insert into public.ever_friends (user_low, user_high)
  values (least(p_a, p_b), greatest(p_a, p_b))
  on conflict (user_low, user_high) do nothing;
$$;

-- Ja foram amigos ACEITOS algum dia? (lapide; NAO implica amizade ativa).
create or replace function public.were_ever_friends(p_a uuid, p_b uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.ever_friends e
    where e.user_low = least(p_a, p_b) and e.user_high = greatest(p_a, p_b)
  );
$$;

-- Streak = dias consecutivos (terminando hoje OU ontem) com >=1 review, em um
-- fuso fixo. Espelha o cliente (vivo se hoje vazio mas ontem teve). Obs.: o
-- cliente usa o fuso LOCAL do navegador; aqui usamos fuso fixo, entao o streak
-- de um amigo pode diferir em ate 1 dia se ele estiver em outro fuso.
create or replace function public.compute_streak(p_user uuid, p_tz text default 'America/Sao_Paulo')
returns integer language sql stable as $$
  with days as (
    select distinct (rl.reviewed_at at time zone p_tz)::date as d
    from public.review_logs rl
    where rl.user_id = p_user
      and (rl.reviewed_at at time zone p_tz)::date <= (now() at time zone p_tz)::date
  ),
  grp as (
    select d, (d - (row_number() over (order by d))::int) as g from days
  ),
  islands as (
    select max(d) as end_d, count(*)::int as len from grp group by g
  )
  select coalesce((
    select len from islands
    where end_d = (now() at time zone p_tz)::date
       or end_d = (now() at time zone p_tz)::date - 1
    order by len desc limit 1
  ), 0);
$$;

revoke all on function public.has_accepted_friendship(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_blocked(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid)             from public, anon, authenticated;
revoke all on function public.record_ever_friends(uuid, uuid)     from public, anon, authenticated;
revoke all on function public.were_ever_friends(uuid, uuid)       from public, anon, authenticated;
revoke all on function public.compute_streak(uuid, text)          from public, anon, authenticated;

-- my_streak(): thin PUBLIC wrapper so a signed-in user can read THEIR OWN current
-- streak with no time-window ceiling. compute_streak stays REVOKEd from
-- authenticated (it takes an arbitrary user id); this wrapper accepts NO argument
-- and is hard-scoped to auth.uid(), so a caller can only ever get their own streak.
-- SECURITY DEFINER is needed only to reach the revoked helper.
create or replace function public.my_streak()
returns integer language sql stable security definer set search_path = public as $$
  select public.compute_streak(auth.uid());
$$;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5) Enviar convite (por e-mail). Resolve para conta se existir; senao guarda
--    como convite-por-e-mail. Barra auto-convite, dedup, reabre 'declined' e
--    aplica BLOQUEIO de forma SILENCIOSA (no-op que aparenta sucesso).
-- ----------------------------------------------------------------------------
create or replace function public.send_friend_invite(p_to_email text)
returns jsonb language plpgsql security definer
set search_path = public, auth as $$
declare
  v_me uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_to_email, '')));
  v_my_email text;
  v_to uuid;
  v_f record;
  v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'e-mail invalido'; end if;

  select lower(email) into v_my_email from auth.users where id = v_me;
  if v_email = v_my_email then raise exception 'voce nao pode convidar a si mesmo'; end if;

  select id into v_to from auth.users where lower(email) = v_email limit 1;

  if v_to is not null then
    -- Convite conta -> conta.
    if v_to = v_me then raise exception 'voce nao pode convidar a si mesmo'; end if;

    -- BLOQUEIO (qualquer direcao): no-op SILENCIOSO. Nao cria convite e devolve
    -- um resultado que parece um envio normal (nao revela o bloqueio ao remetente).
    if public.is_blocked(v_me, v_to) then
      return jsonb_build_object('status','pending');
    end if;

    select * into v_f from public.friendships f
      where f.addressee_id is not null
        and least(f.requester_id, f.addressee_id)    = least(v_me, v_to)
        and greatest(f.requester_id, f.addressee_id) = greatest(v_me, v_to)
      limit 1;
    if found then
      if v_f.status = 'accepted' then return jsonb_build_object('status','already_friends','id',v_f.id); end if;
      if v_f.status = 'pending'  then return jsonb_build_object('status','already_pending','id',v_f.id); end if;
      -- 'declined': reabre como pendente partindo de mim.
      update public.friendships
        set requester_id = v_me, addressee_id = v_to, status = 'pending',
            responded_at = null, updated_at = now()
        where id = v_f.id;
      return jsonb_build_object('status','pending','id',v_f.id);
    end if;
    insert into public.friendships (requester_id, addressee_id, status)
      values (v_me, v_to, 'pending') returning id into v_id;
    return jsonb_build_object('status','pending','id',v_id);
  else
    -- Convite por e-mail (sem conta ainda): guarda; reconcilia no signup/login.
    select * into v_f from public.friendships f
      where f.requester_id = v_me and f.addressee_id is null
        and lower(f.addressee_email) = v_email limit 1;
    if found then return jsonb_build_object('status','already_pending_email','id',v_f.id); end if;
    insert into public.friendships (requester_id, addressee_email, status)
      values (v_me, v_email, 'pending') returning id into v_id;
    return jsonb_build_object('status','pending_email','id',v_id);
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 6) Responder convite (so o DESTINATARIO/conta convidada aceita ou recusa).
-- ----------------------------------------------------------------------------
create or replace function public.respond_friend_invite(p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_f record;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into v_f from public.friendships where id = p_id;
  if not found then raise exception 'convite nao encontrado'; end if;
  if v_f.addressee_id is distinct from v_me then raise exception 'apenas o destinatario pode responder'; end if;
  if v_f.status <> 'pending' then raise exception 'convite ja respondido'; end if;
  update public.friendships
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now(), updated_at = now()
    where id = p_id;
  -- Ao ACEITAR, grava a lapide "ja foram amigos" (sobrevive a desfazer/bloquear).
  if p_accept then
    perform public.record_ever_friends(v_f.requester_id, v_me);
  end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end, 'id', p_id);
end;
$$;


-- ----------------------------------------------------------------------------
-- 7) Remover amizade / cancelar convite (qualquer das partes). NAO bloqueia.
-- ----------------------------------------------------------------------------
create or replace function public.remove_friendship(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_f record;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select * into v_f from public.friendships
    where id = p_id and (requester_id = v_me or addressee_id = v_me);
  if not found then return false; end if;
  -- Mantem a lapide: se a amizade era ACEITA, registra que um dia foram amigos
  -- ANTES de apagar a linha (assim "desfazer e depois bloquear" funciona).
  if v_f.status = 'accepted' and v_f.addressee_id is not null then
    perform public.record_ever_friends(v_f.requester_id, v_f.addressee_id);
  end if;
  delete from public.friendships where id = p_id;
  return true;
end;
$$;


-- ----------------------------------------------------------------------------
-- 8) Bloquear: so quem E/FOI amigo (amizade aceita) OU ja ha bloqueio entre
--    voces (reciprocidade). Insere o bloqueio DIRECIONAL e DESFAZ a amizade.
-- ----------------------------------------------------------------------------
create or replace function public.block_friend(p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_target = v_me then raise exception 'voce nao pode bloquear a si mesmo'; end if;

  -- Regra: bloqueia quem E amigo agora, JA FOI amigo (lapide ever_friends) OU
  -- ja tem bloqueio com voce (reciproco). Estranho de verdade => erro.
  if not (
       public.has_accepted_friendship(v_me, p_target)
    or public.were_ever_friends(v_me, p_target)
    or public.is_blocked(v_me, p_target)
  ) then
    raise exception 'so e possivel bloquear alguem que e (ou foi) seu amigo';
  end if;

  -- Se sao amigos aceitos agora, garante a lapide antes de desfazer a amizade.
  if public.has_accepted_friendship(v_me, p_target) then
    perform public.record_ever_friends(v_me, p_target);
  end if;

  -- Bloqueio direcional (eu -> alvo). Idempotente.
  insert into public.friend_blocks (blocker_id, blocked_id)
    values (v_me, p_target)
    on conflict (blocker_id, blocked_id) do nothing;

  -- DESFAZ a amizade: remove a linha (qualquer status) entre nos. are_friends
  -- passa a false na hora; o desbloqueio NAO re-amiga (a linha ja foi embora).
  delete from public.friendships f
    where (f.requester_id = v_me and f.addressee_id = p_target)
       or (f.requester_id = p_target and f.addressee_id = v_me);

  return jsonb_build_object('status','blocked');
end;
$$;


-- ----------------------------------------------------------------------------
-- 9) Desbloquear: remove SO o MEU bloqueio sobre o alvo. NAO re-amiga (a
--    amizade ja sumiu no block) — viram estranhos; reconvite e do zero. Se o
--    alvo tambem me bloqueia, esse bloqueio (direcional) permanece.
-- ----------------------------------------------------------------------------
create or replace function public.unblock_friend(p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_n integer;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.friend_blocks
    where blocker_id = v_me and blocked_id = p_target;
  get diagnostics v_n = row_count;
  return jsonb_build_object('status','unblocked','removed', v_n > 0);
end;
$$;


-- ----------------------------------------------------------------------------
-- 10) Reconciliacao no login: vincula convites-por-e-mail ao e-mail do usuario
--     logado (mesmo padrao de apply_pending_plan). Seguro: sem parametro spoofavel.
-- ----------------------------------------------------------------------------
create or replace function public.apply_pending_friend_invites()
returns integer language plpgsql security definer
set search_path = public, auth as $$
declare v_me uuid := auth.uid(); v_email text; v_n integer := 0;
begin
  if v_me is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_me;
  if v_email is null then return 0; end if;

  update public.friendships f
     set addressee_id = v_me, addressee_email = null, updated_at = now()
   where f.addressee_id is null
     and lower(f.addressee_email) = v_email
     and f.requester_id <> v_me
     and not exists (
       select 1 from public.friendships x
       where x.addressee_id is not null
         and least(x.requester_id, x.addressee_id)    = least(f.requester_id, v_me)
         and greatest(x.requester_id, x.addressee_id) = greatest(f.requester_id, v_me)
     );
  get diagnostics v_n = row_count;

  -- Limpa convites-por-e-mail remanescentes (colisao ou auto-endereçados).
  delete from public.friendships f
   where f.addressee_id is null and lower(f.addressee_email) = v_email;

  return v_n;
end;
$$;


-- ----------------------------------------------------------------------------
-- 11) LEITURA do progresso de um amigo: o UNICO portao para dados de terceiros.
--     Exige amizade ACEITA e NAO bloqueada (are_friends ja cobre os dois).
-- ----------------------------------------------------------------------------
-- reviews_today = revisoes de HOJE (fuso America/Sao_Paulo, igual ao streak).
-- Trocar reviews_7d -> reviews_today MUDA o tipo de retorno: DROP antes do create.
drop function if exists public.get_friend_progress(uuid);
create or replace function public.get_friend_progress(p_friend uuid)
returns table(
  friend_id uuid, display_name text, streak integer,
  total_xp integer, level integer,
  total_reviews bigint, reviews_today bigint, achievements jsonb
) language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if not public.are_friends(v_me, p_friend) then
    raise exception 'sem amizade ativa com este usuario';  -- nada vaza
  end if;
  return query
  select
    p.id,
    p.display_name,
    public.compute_streak(p_friend),
    coalesce(g.total_xp, 0),
    coalesce(g.level, 1),
    (select count(*) from public.review_logs rl where rl.user_id = p_friend),
    (select count(*) from public.review_logs rl
       where rl.user_id = p_friend
         and (rl.reviewed_at at time zone 'America/Sao_Paulo')::date
             = (now() at time zone 'America/Sao_Paulo')::date),
    coalesce((
      select jsonb_agg(jsonb_build_object('key', au.achievement_key, 'unlocked_at', au.unlocked_at)
                       order by au.unlocked_at)
      from public.achievement_unlocks au where au.user_id = p_friend
    ), '[]'::jsonb)
  from public.profiles p
  left join public.gamification g on g.user_id = p.id
  where p.id = p_friend;
end;
$$;


-- ----------------------------------------------------------------------------
-- 12) Listagens (DEFINER porque profiles e own-only). So o que e do proprio
--     usuario; sempre EXCLUEM relacoes bloqueadas (qualquer direcao).
-- ----------------------------------------------------------------------------
-- friend_id = id da outra conta; friendship_id = id da LINHA de amizade (usado
-- por remove_friendship); avatar_url = foto (profiles.settings->>'profilePhoto',
-- mesma fonte do header). Novas colunas MUDAM o tipo de retorno: DROP antes.
drop function if exists public.list_friends();
create or replace function public.list_friends()
returns table(friend_id uuid, friendship_id uuid, display_name text,
              avatar_url text, since timestamptz)
language sql security definer set search_path = public as $$
  with mine as (
    select f.id as friendship_id,
           case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as other_id,
           f.responded_at as since
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select m.other_id, m.friendship_id, p.display_name, p.settings->>'profilePhoto', m.since
  from mine m
  join public.profiles p on p.id = m.other_id
  where not public.is_blocked(auth.uid(), m.other_id);
$$;

-- avatar_url e a foto de perfil da outra parte (profiles.settings->>'profilePhoto',
-- a mesma fonte do avatar do header). Como adicionar uma coluna MUDA o tipo de
-- retorno, e "create or replace" nao altera tipo de retorno, derruba antes. O
-- DROP remove os grants; eles sao reaplicados na secao 13 (arquivo inteiro) ou
-- no snippet avulso.
drop function if exists public.list_friend_invites();
create or replace function public.list_friend_invites()
returns table(id uuid, direction text, other_id uuid, other_email text,
              display_name text, avatar_url text, created_at timestamptz)
language sql security definer set search_path = public as $$
  with mine as (
    select f.id, f.requester_id, f.addressee_id, f.addressee_email, f.created_at,
           case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as other_id
    from public.friendships f
    where f.status = 'pending'
      and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select
    m.id,
    case when m.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    m.other_id,
    case when m.requester_id = auth.uid() then m.addressee_email end,
    p.display_name,
    p.settings->>'profilePhoto',
    m.created_at
  from mine m
  left join public.profiles p on p.id = m.other_id
  where m.other_id is null or not public.is_blocked(auth.uid(), m.other_id);
$$;

-- Lista SO os bloqueios que EU fiz (gerenciar lista de bloqueados).
create or replace function public.list_blocked()
returns table(blocked_id uuid, display_name text, blocked_at timestamptz)
language sql security definer set search_path = public as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.friend_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;


-- ----------------------------------------------------------------------------
-- 13) GRANTs: o usuario logado chama estas (cada uma confere auth.uid()).
-- ----------------------------------------------------------------------------
revoke all on function public.send_friend_invite(text)              from public, anon;
revoke all on function public.respond_friend_invite(uuid, boolean)  from public, anon;
revoke all on function public.remove_friendship(uuid)               from public, anon;
revoke all on function public.block_friend(uuid)                    from public, anon;
revoke all on function public.unblock_friend(uuid)                  from public, anon;
revoke all on function public.apply_pending_friend_invites()        from public, anon;
revoke all on function public.get_friend_progress(uuid)             from public, anon;
revoke all on function public.list_friends()                        from public, anon;
revoke all on function public.list_friend_invites()                 from public, anon;
revoke all on function public.list_blocked()                        from public, anon;

grant execute on function public.send_friend_invite(text)              to authenticated, service_role;
grant execute on function public.respond_friend_invite(uuid, boolean)  to authenticated, service_role;
grant execute on function public.remove_friendship(uuid)               to authenticated, service_role;
grant execute on function public.block_friend(uuid)                    to authenticated, service_role;
grant execute on function public.unblock_friend(uuid)                  to authenticated, service_role;
grant execute on function public.apply_pending_friend_invites()        to authenticated, service_role;
grant execute on function public.get_friend_progress(uuid)             to authenticated, service_role;
grant execute on function public.list_friends()                        to authenticated, service_role;
grant execute on function public.list_friend_invites()                 to authenticated, service_role;
grant execute on function public.list_blocked()                        to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 14) Backfill: grava a lapide para amizades JA aceitas hoje (idempotente).
--     Cobre amizades aceitas ANTES desta migracao, para que "desfazer e depois
--     bloquear" tambem funcione para elas.
-- ----------------------------------------------------------------------------
insert into public.ever_friends (user_low, user_high)
select least(requester_id, addressee_id), greatest(requester_id, addressee_id)
from public.friendships
where status = 'accepted' and addressee_id is not null
on conflict (user_low, user_high) do nothing;
-- Fim.
