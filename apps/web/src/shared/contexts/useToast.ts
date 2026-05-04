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
  toasts: Toast[];
  toast: (message: string, options?: Partial<Toast>) => void;
  success: (message: string, options?: Partial<Toast>) => void;
  error: (message: string, options?: Partial<Toast>) => void;
  info: (message: string, options?: Partial<Toast>) => void;
  loading: (message: string, options?: Partial<Toast>) => void;
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
