import type { ReactNode } from "react";

export type ConfirmVariant = "danger" | "warning" | "default";

export interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant: ConfirmVariant;
  /** Focused when confirm() was called; focus returns here on close (the dialog has no trigger). */
  returnFocusTo?: HTMLElement | null;
}

const CLOSED: ConfirmState = { isOpen: false, title: "", message: "", variant: "default" };

/**
 * One confirm dialog's state, outside React so the host component can stay mounted across
 * open/close (Radix then plays the close animation and returns focus).
 */
export function createConfirmStore() {
  let state = CLOSED;
  let resolve: ((result: boolean) => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: ConfirmState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    open(next: Omit<ConfirmState, "isOpen">, onResult: (result: boolean) => void) {
      // A second confirm while one is open cancels the first.
      resolve?.(false);
      resolve = onResult;
      set({ ...next, isOpen: true });
    },
    finish(result: boolean) {
      const done = resolve;
      resolve = null;
      // Keep title and message so the closing animation still shows them.
      set({ ...state, isOpen: false });
      done?.(result);
    },
  };
}

export type ConfirmStore = ReturnType<typeof createConfirmStore>;
