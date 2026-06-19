import * as React from 'react';

/**
 * Modal — from kioku@1.0.0.
 */
export interface ModalProps {
open: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; width?: number; onSubmit?: () => void; persistent?: boolean;
}

export declare const Modal: React.ComponentType<ModalProps>;
