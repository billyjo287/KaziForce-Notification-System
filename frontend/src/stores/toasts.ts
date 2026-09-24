// Short confirmation messages ("toasts"), optionally with one action such as "Undo".
import { create } from 'zustand';

export interface ToastItem {
  id: number;
  message: string;
  /** Button text, e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: ToastItem[];
  show: (toast: Omit<ToastItem, 'id'>) => void;
  remove: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  // Only the newest toast is kept, so messages never pile up on a small screen.
  show: (toast) => set({ toasts: [{ ...toast, id: nextId++ }] }),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const showToast = (toast: Omit<ToastItem, 'id'>) => useToasts.getState().show(toast);
