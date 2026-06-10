/**
 * Minimal global toast store (no deps). Used to surface non-blocking,
 * pt-BR messages — e.g. a background review write that failed — without
 * coupling the data layer to React. Mount <Toaster /> once to render them.
 */
import { uuid } from './uuid';

export type ToastKind = 'error' | 'info' | 'success';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): Toast[] {
  return toasts;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function pushToast(kind: ToastKind, message: string, ttlMs = 6000): string {
  const id = uuid();
  // Collapse exact duplicates so a flaky network doesn't stack identical toasts.
  if (toasts.some((t) => t.message === message && t.kind === kind)) return id;
  toasts = [...toasts, { id, kind, message }];
  emit();
  if (ttlMs > 0 && typeof setTimeout !== 'undefined') {
    setTimeout(() => dismissToast(id), ttlMs);
  }
  return id;
}
