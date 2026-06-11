import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Confirmação interna do Kioku (substitui o window.confirm nativo do navegador).
 * Mesma identidade visual dos demais modais; o botão de confirmar usa o accent
 * (ações destrutivas, como excluir).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm" style={{ lineHeight: 1.6, color: 'var(--muted)' }}>
        {message}
      </p>
    </Modal>
  );
}
