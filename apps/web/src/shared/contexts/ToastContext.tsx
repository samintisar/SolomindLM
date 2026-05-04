import { useCallback, useState, ReactNode } from "react";
import { Toast, ToastContext } from "./useToast";

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
