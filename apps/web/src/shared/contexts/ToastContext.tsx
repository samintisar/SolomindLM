import { createContext, useContext, useCallback, useState, ReactNode } from "react";

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

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, options?: Partial<Toast>) => void;
  success: (message: string, options?: Partial<Toast>) => void;
  error: (message: string, options?: Partial<Toast>) => void;
  info: (message: string, options?: Partial<Toast>) => void;
  loading: (message: string, options?: Partial<Toast>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, options: Partial<Toast> = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = {
      id,
      message,
      type: options.type || "info",
      duration: options.duration ?? DEFAULT_DURATION,
      action: options.action,
    };

    setToasts((prev) => [...prev, newToast]);

    if (newToast.type !== "loading" && newToast.duration) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, newToast.duration);
    }

    return id;
  }, []);

  const success = useCallback(
    (message: string, options?: Partial<Toast>) => {
      return toast(message, { ...options, type: "success" });
    },
    [toast]
  );

  const error = useCallback(
    (message: string, options?: Partial<Toast>) => {
      const { duration: durationOverride, ...rest } = options ?? {};
      return toast(message, {
        ...rest,
        type: "error",
        duration: durationOverride ?? 6000,
      });
    },
    [toast]
  );

  const info = useCallback(
    (message: string, options?: Partial<Toast>) => {
      return toast(message, { ...options, type: "info" });
    },
    [toast]
  );

  const loading = useCallback(
    (message: string, options?: Partial<Toast>) => {
      return toast(message, { ...options, type: "loading", duration: Infinity });
    },
    [toast]
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, success, error, info, loading, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
