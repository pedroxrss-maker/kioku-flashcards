import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional footer actions row. */
  footer?: ReactNode;
  width?: number;
  /** When set, Ctrl/Cmd+D fires this (the modal's primary "Salvar" action), a
   *  keyboard shortcut to save without reaching for the mouse. */
  onSubmit?: () => void;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Brand modal: 2px border + soft shadow, ESC + overlay close, fade/scale in
 *  AND out (never abrupt). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  onSubmit,
}: ModalProps) {
  const reduce = useReducedMotion();

  // Close only on a deliberate backdrop tap: the press must START and END on the
  // overlay itself with little movement. This stops a touch that merely grazes
  // the edge, a swipe/scroll, or a drag that began inside the dialog (e.g. while
  // selecting text in an input) from synthesizing a backdrop "click" and
  // dismissing the modal, the over-sensitive close on mobile.
  const press = useRef<{ onOverlay: boolean; x: number; y: number } | null>(null);
  const CLOSE_SLOP = 10; // px of movement still treated as a tap, not a drag
  // When was the last context menu (right-click) opened inside the modal. A
  // native menu (e.g. right-click > Colar) can dismiss with a synthesized press
  // on the backdrop; we must never treat that as a deliberate close.
  const lastContextMenu = useRef(0);

  const onOverlayPointerDown = (e: ReactPointerEvent) => {
    press.current = { onOverlay: e.target === e.currentTarget, x: e.clientX, y: e.clientY };
  };

  const onOverlayPointerUp = (e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || !p.onOverlay) return; // didn't start on the backdrop
    if (e.target !== e.currentTarget) return; // didn't end on the backdrop
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLOSE_SLOP) return; // a drag/graze
    // Ignore a backdrop "tap" right after a context menu (e.g. paste via
    // right-click): that is the menu dismissing, not the user closing.
    if (lastContextMenu.current && Date.now() - lastContextMenu.current < 2500) {
      lastContextMenu.current = 0;
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Ctrl/Cmd+D saves (the primary action). preventDefault stops the browser
      // "bookmark this page" shortcut from hijacking it.
      if (onSubmit && (e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, onSubmit]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          style={{ animation: 'none' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: 'easeOut' }}
          onPointerDown={onOverlayPointerDown}
          onPointerUp={onOverlayPointerUp}
          onPointerCancel={() => {
            press.current = null;
          }}
          onContextMenu={() => {
            lastContextMenu.current = Date.now();
          }}
        >
          <motion.div
            className="modal-box"
            style={{ maxWidth: width, animation: 'none' }}
            role="dialog"
            aria-modal
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
          >
            <button className="modal-close" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
            {title && (
              <h2 className="display mb-4 sm:mb-5" style={{ fontSize: 24 }}>
                {title}
              </h2>
            )}
            {children}
            {footer && (
              <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
