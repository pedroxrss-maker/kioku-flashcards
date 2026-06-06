import { useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { dismissToast, getToasts, subscribeToasts } from '../lib/toast';

/** Renders the global toast stack (bottom-right). Mount once at the app root. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[1100] flex flex-col gap-2"
      style={{ right: 16, bottom: 16, maxWidth: 360 }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rise flex items-start gap-3 px-4 py-3"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${t.kind === 'error' ? 'var(--accent)' : 'var(--line-strong)'}`,
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <span
            className="mt-1.5 shrink-0 rounded-full"
            style={{
              width: 8,
              height: 8,
              background:
                t.kind === 'error'
                  ? 'var(--accent)'
                  : t.kind === 'success'
                    ? 'var(--accent-green)'
                    : 'var(--muted)',
            }}
          />
          <p className="text-sm flex-1 leading-snug">{t.message}</p>
          <button
            type="button"
            aria-label="Dispensar"
            onClick={() => dismissToast(t.id)}
            className="text-muted hover:text-fg transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
