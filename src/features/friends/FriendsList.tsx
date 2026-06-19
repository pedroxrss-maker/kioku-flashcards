import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Ban, Flame, MoreVertical, Trophy, UserMinus, Zap } from 'lucide-react';
import { Panel } from '../../components/Panel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { supabase } from '../../lib/supabase';
import { pushToast } from '../../lib/toast';
import { invalidate } from '../../db/store';
import { PersonAvatar } from './invites';
import { friendActionError, useFriendProgress, useFriends } from './friends';
import type { Friend } from './friends';

/** Secao "Meus amigos": amizades aceitas, cada uma com seu progresso. */
export function FriendsList() {
  const friends = useFriends();

  if (!friends.loaded && friends.loading) {
    return <p className="mono text-muted text-sm">Carregando…</p>;
  }
  if (friends.error && !friends.loaded) {
    return (
      <p className="text-sm text-muted">
        Não foi possível carregar seus amigos.{' '}
        <button type="button" className="underline hover:text-fg" onClick={friends.reload}>
          Tentar novamente
        </button>
      </p>
    );
  }
  if (friends.data.length === 0) {
    return <p className="text-sm text-muted">Você ainda não tem amigos. Convide alguém acima.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {friends.data.map((f) => (
        <FriendCard key={f.friend_id} friend={f} />
      ))}
    </div>
  );
}

function FriendCard({ friend }: { friend: Friend }) {
  // Progresso por amigo: query independente (carregam em paralelo, cache proprio).
  const progress = useFriendProgress(friend.friend_id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'unfriend' | 'block'>(null);
  const [busy, setBusy] = useState(false);
  const name = friend.display_name ?? 'Amigo';

  async function runAction(
    run: () => PromiseLike<{ error: { message: string } | null }>,
    successMsg: string,
  ) {
    setBusy(true);
    try {
      const { error } = await run();
      if (error) {
        pushToast('error', friendActionError(error.message));
        setBusy(false);
        return;
      }
      pushToast('success', successMsg);
      invalidate(); // atualiza amigos + convites + badge do header
    } catch {
      pushToast('error', 'Não foi possível concluir. Tente novamente.');
      setBusy(false);
    }
  }

  function doUnfriend() {
    // remove_friendship precisa do id da LINHA de amizade (friendship_id). Se o
    // list_friends atualizado ainda nao foi aplicado, nao chamamos a RPC quebrada.
    if (!friend.friendship_id) {
      pushToast('error', 'Atualize o banco (list_friends) para desfazer amizades.');
      return;
    }
    void runAction(
      () => supabase.rpc('remove_friendship', { p_id: friend.friendship_id }),
      'Amizade desfeita.',
    );
  }
  function doBlock() {
    // block_friend recebe o id do USUARIO (friend_id) e desfaz a amizade dentro.
    void runAction(
      () => supabase.rpc('block_friend', { p_target: friend.friend_id }),
      'Usuário bloqueado.',
    );
  }

  const p = progress.data;

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <PersonAvatar url={friend.avatar_url} label={name} size={42} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{name}</p>
          {p && (
            <p className="text-xs text-muted">
              Nível {p.level} · {p.total_xp} XP
            </p>
          )}
        </div>

        {/* Acoes (sutis, atras de um menu). */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={busy}
            aria-label="Opções do amigo"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="grid place-items-center rounded-full p-2 text-muted transition-colors hover:bg-[color:var(--surface-2)] hover:text-fg"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                key="menu"
                className="absolute right-0 z-50 mt-1 w-48 py-1"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  transformOrigin: 'top right',
                  background: 'var(--surface)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--shadow-pop)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm('unfriend');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[color:var(--surface-2)]"
                >
                  <UserMinus size={14} /> Desfazer amizade
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm('block');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[color:var(--surface-2)]"
                  style={{ color: 'var(--accent)' }}
                >
                  <Ban size={14} /> Bloquear
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Progresso do amigo. */}
      <div className="mt-3">
        {!progress.loaded && progress.loading ? (
          <p className="mono text-[11px] text-muted">Carregando progresso…</p>
        ) : progress.error && !progress.loaded ? (
          <p className="text-xs text-muted">Não foi possível carregar o progresso.</p>
        ) : p ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="flex items-center gap-1.5" title="Sequência atual">
              <Flame size={15} style={{ color: 'var(--accent)' }} />
              {p.streak} {p.streak === 1 ? 'dia' : 'dias'}
            </span>
            <span className="flex items-center gap-1.5" title="Revisões hoje">
              <Zap size={15} style={{ color: 'var(--accent-green)' }} />
              {p.reviews_today ?? 0} hoje
            </span>
            <span className="text-muted" title="Revisões no total">
              {p.total_reviews} no total
            </span>
            <span className="flex items-center gap-1.5" title="Conquistas">
              <Trophy size={15} style={{ color: 'var(--accent-amber)' }} />
              {p.achievements.length}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted">Sem dados de progresso.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'unfriend'}
        onClose={() => setConfirm(null)}
        onConfirm={doUnfriend}
        title="Desfazer amizade"
        message={
          <>
            Desfazer a amizade com <b className="text-fg">{name}</b>? Vocês deixarão de ver o
            progresso um do outro. Você pode convidar novamente depois.
          </>
        }
        confirmLabel="Desfazer"
      />
      <ConfirmDialog
        open={confirm === 'block'}
        onClose={() => setConfirm(null)}
        onConfirm={doBlock}
        title="Bloquear usuário"
        message={
          <>
            Bloquear <b className="text-fg">{name}</b>? A amizade será desfeita e a pessoa não
            poderá te convidar novamente. Ela não é avisada.
          </>
        }
        confirmLabel="Bloquear"
      />
    </Panel>
  );
}
