import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Ban, ChevronDown, Loader2, Mail, UserPlus, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BackLink } from '../components/BackLink';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { supabase } from '../lib/supabase';
import { pushToast } from '../lib/toast';
import { invalidate } from '../db/store';
import { InviteAvatar, inviteLabel, useFriendInvites } from '../features/friends/invites';
import type { FriendInvite } from '../features/friends/invites';
import { FriendsList } from '../features/friends/FriendsList';
import { BlockedList } from '../features/friends/BlockedList';

/**
 * Amigos — compartilhamento de progresso entre amigos.
 *
 * ETAPA 1: apenas o "esqueleto" navegavel. As secoes mostram seus titulos e um
 * estado vazio "em breve"; nenhuma RPC do Supabase e chamada ainda (a fundacao
 * SQL ja existe: send_friend_invite, respond_friend_invite, remove_friendship,
 * block_friend, unblock_friend, list_friends, list_friend_invites, list_blocked,
 * get_friend_progress). A ligacao de dados vem nas proximas etapas.
 */

/** Cartao de secao: cabecalho com icone + titulo e, abaixo, o corpo. */
function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Panel className="p-5 md:p-6">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="shrink-0 grid place-items-center rounded-[var(--r-md)]"
          style={{ width: 38, height: 38, background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight">{title}</h2>
          {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

/* ------------------------------------------------------- convidar amigo -- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Converte a mensagem crua de uma exception SQL em pt-BR limpo. */
function inviteErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('si mesmo')) return 'Você não pode convidar a si mesmo.';
  if (m.includes('invalido') || m.includes('inválido')) return 'E-mail inválido.';
  if (m.includes('not authenticated')) return 'Faça login para convidar amigos.';
  return 'Não foi possível enviar o convite. Tente novamente.';
}

/**
 * Le o campo `status` da resposta da RPC de forma tolerante a forma. A funcao
 * `send_friend_invite` e `returns jsonb` (escalar), entao `data` chega como o
 * objeto {status}. Mas se a versao publicada devolver um conjunto (TABLE/SETOF),
 * o cliente receberia um array [{status}] — cobrimos os dois (e o caso raro de
 * string JSON) para que 'pending_email' nunca caia no default (mensagem curta)
 * so por causa da forma.
 */
function readStatus(data: unknown): string | undefined {
  let d: unknown = data;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(d)) d = d[0];
  if (d && typeof d === 'object' && 'status' in d) {
    const s = (d as { status?: unknown }).status;
    return typeof s === 'string' ? s : undefined;
  }
  return undefined;
}

/**
 * Formulario de convite por e-mail. Chama a RPC send_friend_invite e traduz o
 * status retornado (ou a exception) em um toast pt-BR.
 *
 * Privacidade: se o ALVO bloqueou o usuario, a funcao retorna 'pending' de
 * proposito (silencioso). Tratamos 'pending' como sucesso normal e NAO criamos
 * nenhum caminho especial que pudesse revelar o bloqueio.
 */
function InviteForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      pushToast('error', 'Digite um e-mail válido.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('send_friend_invite', { p_to_email: value });
      if (error) {
        pushToast('error', inviteErrorMessage(error.message));
        return;
      }
      const status = readStatus(data);
      switch (status) {
        case 'pending_email':
          pushToast(
            'success',
            'Convite enviado. Ele aparecerá para a pessoa quando ela criar uma conta no Kioku.',
          );
          break;
        case 'already_pending':
        case 'already_pending_email':
          pushToast('info', 'Você já enviou um convite para essa pessoa.');
          break;
        case 'already_friends':
          pushToast('info', 'Vocês já são amigos.');
          break;
        case 'pending':
        default:
          // Inclui o caso "alvo bloqueou": 'pending' silencioso = sucesso normal.
          pushToast('success', 'Convite enviado.');
          break;
      }
      setEmail(''); // limpa apos um envio processado (e-mail era valido)
    } catch {
      pushToast('error', 'Não foi possível enviar o convite. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@exemplo.com"
        aria-label="E-mail do amigo"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="email"
        disabled={loading}
        className="field field-round flex-1 min-w-0"
      />
      <button
        type="submit"
        disabled={loading || email.trim() === ''}
        aria-busy={loading}
        className="btn btn-accent shrink-0"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
        {loading ? 'Convidando…' : 'Convidar'}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- convites -- */

/** Mensagem pt-BR limpa para erros de responder/cancelar convite. */
function inviteActionError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('ja respondido') || m.includes('já respondido'))
    return 'Este convite já foi respondido.';
  if (m.includes('nao encontrado') || m.includes('não encontrado'))
    return 'Convite não encontrado.';
  if (m.includes('destinatario') || m.includes('destinatário'))
    return 'Você não pode responder a este convite.';
  if (m.includes('not authenticated')) return 'Faça login para continuar.';
  return 'Não foi possível concluir. Tente novamente.';
}

/** Uma linha de convite (recebido ou enviado) com suas acoes. */
function InviteRow({ invite }: { invite: FriendInvite }) {
  const [busy, setBusy] = useState(false);
  const incoming = invite.direction === 'incoming';
  // Recebido: o remetente tem conta (display_name). Enviado: nome se a pessoa
  // tiver conta, senao o e-mail (convite para quem ainda nao criou conta).
  const label = inviteLabel(invite);

  async function act(
    run: () => PromiseLike<{ error: { message: string } | null }>,
    successMsg: string,
  ) {
    setBusy(true);
    try {
      const { error } = await run();
      if (error) {
        pushToast('error', inviteActionError(error.message));
        setBusy(false);
        return;
      }
      pushToast('success', successMsg);
      // Mantem os botoes desabilitados ate o refetch remover a linha.
      invalidate(); // atualiza convites (e a lista de amigos quando existir)
    } catch {
      pushToast('error', 'Não foi possível concluir. Tente novamente.');
      setBusy(false);
    }
  }

  return (
    <li className="surface flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0 w-full sm:flex-1">
        <InviteAvatar invite={invite} />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{label}</p>
          <p className="text-xs text-muted truncate">
            {incoming
              ? 'Quer ser seu amigo'
              : invite.display_name
                ? 'Convite enviado'
                : 'Aguardando a pessoa criar uma conta'}
          </p>
        </div>
      </div>

      {incoming ? (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () => supabase.rpc('respond_friend_invite', { p_id: invite.id, p_accept: true }),
                'Convite aceito.',
              )
            }
            className="btn btn-accent btn-sm"
          >
            Aceitar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () => supabase.rpc('respond_friend_invite', { p_id: invite.id, p_accept: false }),
                'Convite recusado.',
              )
            }
            className="btn btn-ghost btn-sm"
          >
            Recusar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <span
            className="mono text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--muted)',
              border: '1px solid var(--line)',
            }}
          >
            pendente
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () => supabase.rpc('remove_friendship', { p_id: invite.id }),
                'Convite cancelado.',
              )
            }
            className="btn btn-ghost btn-sm"
          >
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

/** Secao Convites: recebidos e enviados, via list_friend_invites(). */
function InvitesList() {
  const invites = useFriendInvites();

  if (!invites.loaded && invites.loading) {
    return <p className="mono text-muted text-sm">Carregando…</p>;
  }
  if (invites.error && !invites.loaded) {
    return (
      <p className="text-sm text-muted">
        Não foi possível carregar os convites.{' '}
        <button type="button" className="underline hover:text-fg" onClick={invites.reload}>
          Tentar novamente
        </button>
      </p>
    );
  }

  const incoming = invites.data.filter((i) => i.direction === 'incoming');
  const outgoing = invites.data.filter((i) => i.direction === 'outgoing');

  if (incoming.length === 0 && outgoing.length === 0) {
    return <p className="text-sm text-muted">Nenhum convite pendente.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {incoming.length > 0 && (
        <div>
          <h3 className="mono text-[11px] text-muted mb-2">Convites recebidos</h3>
          <ul className="flex flex-col gap-2">
            {incoming.map((i) => (
              <InviteRow key={i.id} invite={i} />
            ))}
          </ul>
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <h3 className="mono text-[11px] text-muted mb-2">Convites enviados</h3>
          <ul className="flex flex-col gap-2">
            {outgoing.map((i) => (
              <InviteRow key={i.id} invite={i} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Friends() {
  // Bloqueados e secundario (uso pouco frequente): começa recolhido.
  const [showBlocked, setShowBlocked] = useState(false);

  return (
    <div className="rise flex flex-col gap-6 [&>*]:min-w-0">
      <BackLink to="/">Voltar ao início</BackLink>

      <PageHeader title="Amigos" subtitle="Convide amigos e acompanhem o progresso juntos." />

      {/* 1) Convidar amigo */}
      <Section
        icon={UserPlus}
        title="Convidar amigo"
        hint="Envie um convite pelo e-mail da pessoa."
      >
        <InviteForm />
      </Section>

      {/* 2) Convites (recebidos / enviados) */}
      <Section icon={Mail} title="Convites" hint="Convites recebidos e enviados.">
        <InvitesList />
      </Section>

      {/* 3) Meus amigos (amizades aceitas) */}
      <Section
        icon={Users}
        title="Meus amigos"
        hint="Pessoas com quem você compartilha o progresso."
      >
        <FriendsList />
      </Section>

      {/* 4) Bloqueados — secundario / colapsavel */}
      <Panel className="p-2">
        <button
          type="button"
          onClick={() => setShowBlocked((v) => !v)}
          aria-expanded={showBlocked}
          className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3 py-2.5 text-left hover:bg-[color:var(--surface-2)] transition-colors"
        >
          <span
            className="shrink-0 grid place-items-center rounded-[var(--r-md)]"
            style={{ width: 32, height: 32, background: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            <Ban size={16} />
          </span>
          <span className="flex-1 text-sm font-medium text-muted">Bloqueados</span>
          <ChevronDown
            size={16}
            className="text-muted transition-transform"
            style={{ transform: showBlocked ? 'rotate(180deg)' : 'none' }}
            aria-hidden
          />
        </button>
        {showBlocked && (
          <div className="px-3 pb-3 pt-1">
            <BlockedList />
          </div>
        )}
      </Panel>
    </div>
  );
}
