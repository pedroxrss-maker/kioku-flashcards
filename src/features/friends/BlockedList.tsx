import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { pushToast } from '../../lib/toast';
import { invalidate } from '../../db/store';
import { PersonAvatar } from './invites';
import { friendActionError, useBlocked } from './friends';
import type { Blocked } from './friends';

/** Secao "Bloqueados": pessoas que EU bloqueei, com a acao de desbloquear. */
export function BlockedList() {
  const blocked = useBlocked();

  if (!blocked.loaded && blocked.loading) {
    return <p className="mono text-muted text-sm">Carregando…</p>;
  }
  if (blocked.error && !blocked.loaded) {
    return (
      <p className="text-sm text-muted">
        Não foi possível carregar.{' '}
        <button type="button" className="underline hover:text-fg" onClick={blocked.reload}>
          Tentar novamente
        </button>
      </p>
    );
  }
  if (blocked.data.length === 0) {
    return <p className="text-sm text-muted">Você não bloqueou ninguém.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Desbloquear não recria a amizade — vocês precisariam se convidar novamente.
      </p>
      {blocked.data.map((b) => (
        <BlockedRow key={b.blocked_id} person={b} />
      ))}
    </div>
  );
}

function BlockedRow({ person }: { person: Blocked }) {
  const [busy, setBusy] = useState(false);
  const name = person.display_name ?? 'Usuário';

  async function unblock() {
    setBusy(true);
    try {
      // unblock_friend recebe o id do USUARIO bloqueado (blocked_id).
      const { error } = await supabase.rpc('unblock_friend', { p_target: person.blocked_id });
      if (error) {
        pushToast('error', friendActionError(error.message));
        setBusy(false);
        return;
      }
      pushToast('success', 'Desbloqueado. A amizade não é recriada — convidem-se novamente.');
      invalidate(); // atualiza bloqueados (+ amigos/convites/badge se ativos)
    } catch {
      pushToast('error', 'Não foi possível concluir. Tente novamente.');
      setBusy(false);
    }
  }

  return (
    <div className="surface flex items-center gap-3 px-4 py-3">
      <PersonAvatar url={person.avatar_url} label={name} size={36} />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void unblock()}
        className="btn btn-ghost btn-sm shrink-0"
      >
        Desbloquear
      </button>
    </div>
  );
}
