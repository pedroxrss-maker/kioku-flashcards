import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useIsMobile } from '../../lib/useIsMobile';
import { InviteAvatar, inviteLabel, useFriendInvites } from './invites';

/**
 * Controle "Amigos" do header: o icone Users com
 *  - um badge com a contagem de convites RECEBIDOS pendentes (oculto em 0, "9+"
 *    acima de 9),
 *  - no desktop, ao passar o mouse, um preview que desliza para baixo (foto +
 *    nome de cada solicitante),
 *  - no mobile (sem hover), o 1o toque abre o preview e o 2o navega,
 *  - clique (desktop) navega para /amigos.
 * Reusa a query compartilhada de convites (sem busca extra).
 */
export function FriendsHeaderButton() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const invites = useFriendInvites();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const incoming = invites.data.filter((i) => i.direction === 'incoming');
  const count = incoming.length;

  // Limpa o timer de fechamento ao desmontar.
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function openNow() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }
  // Fecha com um pequeno atraso para "ponte" do mouse entre o icone e o popover.
  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }
  function closeNow() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(false);
  }

  function handleClick() {
    // Mobile: com solicitações pendentes, o 1o toque abre o preview e o 2o navega.
    // Sem nada pendente, o 1o toque já leva direto para a aba de amigos.
    if (isMobile && !open && count > 0) {
      setOpen(true);
      return;
    }
    closeNow();
    nav('/amigos');
  }

  const ariaLabel =
    count > 0
      ? `Amigos, ${count} ${count === 1 ? 'nova solicitação' : 'novas solicitações'}`
      : 'Amigos';

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => {
        if (!isMobile) openNow();
      }}
      onMouseLeave={() => {
        if (!isMobile) closeSoon();
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        title="Amigos"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative z-50 inline-flex items-center justify-center rounded-full p-2.5 text-muted hover:bg-[color:var(--surface-2)] hover:text-fg transition-colors"
      >
        <Users size={18} />
        {count > 0 && (
          <span
            className="absolute grid place-items-center rounded-full font-bold tabular-nums text-white"
            style={{
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              fontSize: 10,
              lineHeight: 1,
              background: 'var(--accent)',
              border: '2px solid var(--bg)',
            }}
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Mobile: catcher para fechar ao tocar fora (no desktop fecha no mouseleave). */}
      {open && isMobile && <div className="fixed inset-0 z-40" onClick={closeNow} />}

      <AnimatePresence>
        {open && (
          <motion.div
            key="friends-preview"
            className="absolute left-0 sm:left-auto sm:right-0 z-50 mt-1.5 w-64 max-w-[calc(100vw-24px)] p-2"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={() => {
              if (!isMobile) openNow();
            }}
            onMouseLeave={() => {
              if (!isMobile) closeSoon();
            }}
            style={{
              transformOrigin: 'top right',
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-pop)',
            }}
          >
            {count > 0 ? (
              <>
                <p className="mono text-[11px] text-muted px-2 pt-1 pb-2">
                  Solicitações de amizade
                </p>
                <ul className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
                  {incoming.map((i) => (
                    <li key={i.id} className="flex items-center gap-2.5 px-2 py-1.5">
                      <InviteAvatar invite={i} size={30} />
                      <span className="text-sm truncate">{inviteLabel(i)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    closeNow();
                    nav('/amigos');
                  }}
                  className="mt-1 w-full rounded-[var(--r-sm)] py-2 text-center text-xs font-semibold transition-colors hover:bg-[color:var(--surface-2)]"
                  style={{ color: 'var(--accent)' }}
                >
                  Ver todas
                </button>
              </>
            ) : (
              <p className="px-2 py-4 text-center text-sm text-muted">
                Nenhuma solicitação pendente.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
