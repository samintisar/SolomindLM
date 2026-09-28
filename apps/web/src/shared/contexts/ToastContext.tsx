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

function show(message: string, options: Partial<Toast> = {}): string {
  const type = options.type ?? "info";
  const external = {
    id: options.id,
    action: options.action,
    duration: durationFor(type, options.duration),
  };
  return String(sonner[type](message, external));
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
