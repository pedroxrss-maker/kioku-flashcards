import * as React from 'react';

/**
 * ConfirmDialog — from kioku@1.0.0.
 */
export interface ConfirmDialogProps {
open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; cancelLabel?: string;
}

export declare const ConfirmDialog: React.ComponentType<ConfirmDialogProps>;
