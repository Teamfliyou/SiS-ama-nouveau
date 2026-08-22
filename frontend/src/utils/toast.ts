export type ToastKind = 'success' | 'error';

export type ToastItem = { id: number; kind: ToastKind; message: string };

type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let nextId = 1;

const emit = (kind: ToastKind, message: string) => {
  const item = { id: nextId++, kind, message };
  listeners.forEach(l => l(item));
};

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
