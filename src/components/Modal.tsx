import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Optional footer actions row. */
  footer?: ReactNode;
  width?: number;
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
}: ModalProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

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
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
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
              <h2 className="display mb-5" style={{ fontSize: 24 }}>
                {title}
              </h2>
            )}
            {children}
            {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
