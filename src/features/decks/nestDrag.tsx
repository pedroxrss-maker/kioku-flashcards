/* ===========================================================================
   Drag a deck onto another to nest it (deck -> subdeck). One unified Pointer
   Events implementation for mouse AND touch:
     - mouse: pick up as soon as the pointer moves a few px (immediate drag);
     - touch: pick up only after a 1s long-press (so a tap still opens the deck
       and a swipe still scrolls the list). Once held, scrolling is blocked.
   Drop targets are any element carrying `data-nest-path`; the one under the
   pointer is found with elementFromPoint. The visual state (which row is being
   dragged / is the hovered target, and the floating label) lives in a tiny
   module store so unrelated rows don't re-render on every pointer move.
   =========================================================================== */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PATH_SEP, ROOT_DROP_TARGET } from '../../lib/deckTree';

interface DragState {
  draggingPath: string | null;
  dropTargetPath: string | null;
  label: string;
  x: number;
  y: number;
  /** HTML snapshot of the whole dragged block, shown as the floating ghost. */
  ghostHTML: string;
  ghostW: number;
  /** Pointer offset inside the block at pickup, so the ghost tracks 1:1. */
  offsetX: number;
  offsetY: number;
}

let store: DragState = {
  draggingPath: null,
  dropTargetPath: null,
  label: '',
  x: 0,
  y: 0,
  ghostHTML: '',
  ghostW: 0,
  offsetX: 0,
  offsetY: 0,
};
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function setStore(patch: Partial<DragState>) {
  store = { ...store, ...patch };
  emit();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe to a primitive slice of the drag store (no re-render unless it flips). */
function useDragSelector<T>(sel: (s: DragState) => T): T {
  const get = useCallback(() => sel(store), [sel]);
  return useSyncExternalStore(subscribe, get, get);
}

const LONG_PRESS_MS = 1500; // mobile: hold this long before a deck becomes draggable
const MOUSE_SLOP = 6; // px of movement that starts a mouse drag
const TOUCH_SLOP = 12; // px before the long-press is treated as a scroll instead

interface NestDragOptions {
  /** This element's deck/folder path — its identity as both source and target. */
  path: string;
  /** Short label shown in the floating drag ghost. */
  label: string;
  /** Only real decks are draggable; folders are drop targets only. */
  enabled: boolean;
  /** Called on a committed, legal drop: re-parent `dragPath` under `targetPath`. */
  onDrop: (dragPath: string, targetPath: string) => void;
}

export function useNestDrag({ path, label, enabled, onDrop }: NestDragOptions) {
  const timer = useRef<number | null>(null);
  const armed = useRef(false); // pointer down, waiting for threshold / long-press
  const started = useRef(false); // drag actually in progress
  const start = useRef({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const el = useRef<HTMLElement | null>(null);
  const preventTouch = useRef<((e: TouchEvent) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (preventTouch.current) {
      document.removeEventListener('touchmove', preventTouch.current);
      preventTouch.current = null;
    }
    if (started.current) {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    armed.current = false;
    started.current = false;
    pointerId.current = null;
    if (store.draggingPath === path) setStore({ draggingPath: null, dropTargetPath: null });
  }, [path]);

  useEffect(() => cleanup, [cleanup]); // tidy up if the row unmounts mid-drag

  const begin = useCallback(() => {
    started.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    // Block page scroll for the whole drag (touch). The finger is stationary at
    // pickup, so no scroll has started yet; preventDefault keeps it that way.
    const prevent = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', prevent, { passive: false });
    preventTouch.current = prevent;
    // Snapshot the WHOLE block so the drag ghost mirrors the entire deck card,
    // not just its title. Cloned now — before the re-render dims the source and
    // mounts the ghost portal — so the copy is clean.
    const node = el.current;
    let ghostHTML = '';
    let ghostW = 0;
    let offsetX = 0;
    let offsetY = 0;
    if (node) {
      const rect = node.getBoundingClientRect();
      ghostW = rect.width;
      offsetX = start.current.x - rect.left;
      offsetY = start.current.y - rect.top;
      const clone = node.cloneNode(true) as HTMLElement;
      clone.style.margin = '0';
      clone.style.width = `${rect.width}px`;
      clone.style.maxWidth = 'none';
      clone.style.opacity = '1';
      ghostHTML = clone.outerHTML;
    }
    setStore({ draggingPath: path, dropTargetPath: null, label, ghostHTML, ghostW, offsetX, offsetY });
  }, [path, label]);

  /** Drop target under (x, y): a deck/folder path to nest into, ROOT_DROP_TARGET
   *  when over empty space (lift a nested deck out of its parent), or null. */
  const targetAt = (x: number, y: number): string | null => {
    const host = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-nest-path]');
    const target = host?.dataset.nestPath ?? null;
    if (!target) {
      // Empty space: only meaningful for a deck that actually has a parent.
      return path.includes(PATH_SEP) ? ROOT_DROP_TARGET : null;
    }
    if (target === path) return null;
    if (target.startsWith(path + PATH_SEP)) return null; // own descendant
    return target;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled || (e.button != null && e.button !== 0)) return;
    el.current = e.currentTarget as HTMLElement;
    pointerId.current = e.pointerId;
    start.current = { x: e.clientX, y: e.clientY };
    armed.current = true;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      const id = e.pointerId;
      timer.current = window.setTimeout(() => {
        if (!armed.current) return;
        try {
          el.current?.setPointerCapture(id);
        } catch {
          /* capture may fail if the pointer already left; drag still works */
        }
        begin();
      }, LONG_PRESS_MS);
    }
    // mouse: wait for a small move in onPointerMove before picking up.
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!armed.current && !started.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!started.current) {
      if (e.pointerType === 'mouse') {
        if (Math.hypot(dx, dy) > MOUSE_SLOP) {
          try {
            el.current?.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          begin();
        }
      } else if (Math.hypot(dx, dy) > TOUCH_SLOP) {
        // Moved before the long-press fired: it's a scroll/swipe, not a pick-up.
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        armed.current = false;
      }
      return;
    }
    setStore({ x: e.clientX, y: e.clientY, dropTargetPath: targetAt(e.clientX, e.clientY) });
  };

  const finish = (commit: boolean) => {
    const target = commit ? store.dropTargetPath : null;
    const wasDragging = started.current;
    if (commit && wasDragging && target) onDrop(path, target);
    cleanup();
    // Swallow the click synthesized after a real drag so it doesn't also open
    // the deck. One-shot, capture-phase, with a short safety timeout.
    if (wasDragging) {
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener('click', swallow, true);
      };
      document.addEventListener('click', swallow, true);
      window.setTimeout(() => document.removeEventListener('click', swallow, true), 350);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (pointerId.current != null && e.pointerId !== pointerId.current) return;
    finish(true);
  };
  const onPointerCancel = () => finish(false);

  const dragging = useDragSelector((s) => s.draggingPath === path);
  const isTarget = useDragSelector((s) => s.dropTargetPath === path && s.draggingPath != null);
  // True while ANY deck is being dragged — siblings use it to jiggle in sync.
  const anyDragging = useDragSelector((s) => s.draggingPath != null);

  return {
    /** Spread onto the draggable / droppable element. */
    nestProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      'data-nest-path': path,
    },
    dragging,
    isTarget,
    anyDragging,
  };
}

/** Floating ghost that follows the pointer while a deck is being dragged: a live
 *  HTML snapshot of the WHOLE block, so the entire card moves — not just a label.
 *  Only the row currently being dragged renders this, so there is ever just one. */
export function NestGhost() {
  const s = useSyncExternalStore(subscribe, () => store, () => store);
  if (!s.draggingPath) return null;
  const toRoot = s.dropTargetPath === ROOT_DROP_TARGET;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: s.x - s.offsetX,
        top: s.y - s.offsetY,
        width: s.ghostW || undefined,
        zIndex: 1000,
        pointerEvents: 'none',
        opacity: 0.95,
        filter: 'drop-shadow(0 10px 26px rgba(0,0,0,0.45))',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: s.ghostHTML }} />
      {toRoot && (
        <div
          style={{
            marginTop: 6,
            padding: '4px 9px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--accent-blue)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          Soltar para tirar do deck pai
        </div>
      )}
    </div>,
    document.body,
  );
}
