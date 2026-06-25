/**
 * Notification bell + dropdown (mobile top bar AND desktop sidebar).
 *
 * Shows a single time-sorted feed of two things the user cares about:
 *   - incoming friend requests (pending) — useFriendInvites()
 *   - unlocked achievements              — useAchievements()
 *
 * Both come from the app's existing reactive query cache, so the bell stays in
 * sync with no extra polling (accepting an invite or unlocking a badge calls
 * invalidate(), which refreshes these queries). An "unread" badge counts items
 * newer than `settings.notificationsSeenAt`; opening the bell stamps that to now
 * (persisted, so the read state follows the user across devices).
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Trophy, UserPlus } from 'lucide-react';
import { InviteAvatar, inviteLabel, useFriendInvites } from '../friends/invites';
import type { FriendInvite } from '../friends/invites';
import { useAchievements, useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { ACHIEVEMENTS } from '../gamification/achievements';
import type { AchievementDef } from '../gamification/achievements';

const ACH_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));
const MAX_ITEMS = 40;

type FeedItem =
  | { kind: 'invite'; id: string; ts: number; invite: FriendInvite }
  | { kind: 'achievement'; id: string; ts: number; def: AchievementDef };

/** Compact pt-BR relative time ("agora", "há 5 min", "há 2 h", "há 3 d", date). */
function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'agora';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function NotificationBell() {
  const nav = useNavigate();
  const invites = useFriendInvites();
  const unlocks = useAchievements();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  // The popover is positioned from the button's live rect, so it works the same in
  // the mobile top-right header and the desktop sidebar (very different anchors).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const i of invites.data) {
      if (i.direction !== 'incoming') continue;
      items.push({ kind: 'invite', id: `inv:${i.id}`, ts: Date.parse(i.created_at) || 0, invite: i });
    }
    for (const u of unlocks) {
      const def = ACH_BY_KEY.get(u.key);
      if (def) items.push({ kind: 'achievement', id: `ach:${u.key}`, ts: u.unlockedAt, def });
    }
    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, MAX_ITEMS);
  }, [invites.data, unlocks]);

  const seenAt = settings?.notificationsSeenAt ?? 0;
  const unread = feed.reduce((n, f) => (f.ts > seenAt ? n + 1 : n), 0);

  function toggle() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) {
          const width = Math.min(360, window.innerWidth - 16);
          // Anchor toward the side the button sits on: right-align under the
          // right-side mobile bell, left-align beside the left-side desktop sidebar
          // bell — then clamp so the panel always stays fully on-screen.
          const onRight = r.left + r.width / 2 > window.innerWidth / 2;
          const raw = onRight ? r.right - width : r.left;
          const left = Math.max(8, Math.min(raw, window.innerWidth - 8 - width));
          setPos({ top: r.bottom + 8, left, width });
        }
        // Opening clears the unread badge (best-effort persist; the cache updates
        // optimistically so the badge disappears immediately).
        if (unread > 0) void repo.saveSettings({ notificationsSeenAt: Date.now() });
      }
      return next;
    });
  }

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Notificações"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative p-2 rounded-[var(--r-sm)] text-muted hover:text-fg transition-colors"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full grid place-items-center text-[10px] font-bold leading-none"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />}

      <AnimatePresence>
        {open && pos && (
          <motion.div
            role="menu"
            className="fixed z-[61] flex flex-col"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 'min(70vh, 460px)',
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-pop)',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="text-sm font-bold">Notificações</span>
              {feed.length > 0 && (
                <span className="mono text-[11px] text-muted">{feed.length}</span>
              )}
            </div>

            {feed.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={22} className="mx-auto mb-2" style={{ color: 'var(--muted)' }} />
                <p className="text-sm text-muted">Nenhuma notificação ainda.</p>
                <p className="text-xs text-muted mt-1" style={{ lineHeight: 1.5 }}>
                  Pedidos de amizade e conquistas desbloqueadas aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto py-1">
                {feed.map((f) => {
                  const isNew = f.ts > seenAt;
                  if (f.kind === 'invite') {
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          nav('/amigos');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--surface-2)] transition-colors"
                      >
                        <InviteAvatar invite={f.invite} size={34} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm">
                            <b>{inviteLabel(f.invite)}</b>{' '}
                            <span className="text-muted">enviou um pedido de amizade</span>
                          </span>
                          <span className="block mono text-[11px] text-muted mt-0.5">
                            {relativeTime(f.ts)}
                          </span>
                        </span>
                        <UserPlus size={15} className="shrink-0" style={{ color: 'var(--accent)' }} />
                        {isNew && <Unseen />}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        nav('/conquistas');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--surface-2)] transition-colors"
                    >
                      <span
                        className="shrink-0 grid place-items-center rounded-full"
                        style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        <Trophy size={17} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm">
                          <span className="text-muted">Conquista: </span>
                          <b>{f.def.name}</b>
                        </span>
                        <span className="block text-xs text-muted truncate" style={{ lineHeight: 1.4 }}>
                          {f.def.description}
                        </span>
                        <span className="block mono text-[11px] text-muted mt-0.5">
                          {relativeTime(f.ts)}
                        </span>
                      </span>
                      {isNew && <Unseen />}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Small accent dot marking an item newer than the last time the bell was opened. */
function Unseen() {
  return (
    <span
      aria-hidden
      className="shrink-0 self-start mt-1 rounded-full"
      style={{ width: 7, height: 7, background: 'var(--accent)' }}
    />
  );
}
