import { createContext, useContext } from "react";

export type ToastType = "success" | "error" | "info" | "loading";

export interface Toast {
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

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
