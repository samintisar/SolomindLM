import { createContext, useContext } from "react";
import { toast as sonner } from "sonner";

type ToastType = "success" | "error" | "info" | "loading";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastContextValue {
  toast: (message: string, options?: Partial<Toast>) => string;
  success: (message: string, options?: Partial<Toast>) => string;
  error: (message: string, options?: Partial<Toast>) => string;
  info: (message: string, options?: Partial<Toast>) => string;
  loading: (message: string, options?: Partial<Toast>) => string;
  dismiss: (id: string) => void;
}

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

// Stateless: sonner owns the toast queue, so one module-level object serves every caller.
const toastApi: ToastContextValue = {
  toast: show,
  success: (message, options) => show(message, { ...options, type: "success" }),
  error: (message, options) => show(message, { ...options, type: "error" }),
  info: (message, options) => show(message, { ...options, type: "info" }),
  loading: (message, options) => show(message, { ...options, type: "loading" }),
  dismiss: (id) => {
    sonner.dismiss(id);
  },
};

/** Defaults to the sonner adapter, so no provider is needed; tests may override it. */
export const ToastContext = createContext<ToastContextValue>(toastApi);

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
