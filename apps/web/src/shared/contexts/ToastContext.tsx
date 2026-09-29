import type { ReactNode } from "react";
import { toast as sonner } from "sonner";
import { type Toast, ToastContext, type ToastContextValue, type ToastType } from "./useToast";

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;

function durationFor(type: ToastType, requested?: number): number {
  if (type === "loading") return Infinity;
  if (type === "error") return requested ?? ERROR_DURATION;
  return requested ?? DEFAULT_DURATION;
}

// sonner generates numeric ids and matches them with ===, so we own the ids and keep them strings.
let counter = 0;

function show(message: string, options: Partial<Toast> = {}): string {
  const type = options.type ?? "info";
  const id = options.id ?? `toast-${++counter}`;
  const { action } = options;
  const external = {
    id,
    // sonner closes the toast after an action click; preventDefault keeps it open like before.
    action: action && {
      label: action.label,
      onClick: (event: { preventDefault: () => void }) => {
        event.preventDefault();
        action.onClick();
      },
    },
    duration: durationFor(type, options.duration),
  };
  sonner[type](message, external);
  return id;
}

// Stateless: sonner owns the toast queue, so the context value never changes.
const value: ToastContextValue = {
  toast: show,
  success: (message, options) => show(message, { ...options, type: "success" }),
  error: (message, options) => show(message, { ...options, type: "error" }),
  info: (message, options) => show(message, { ...options, type: "info" }),
  loading: (message, options) => show(message, { ...options, type: "loading" }),
  dismiss: (id) => {
    sonner.dismiss(id);
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
