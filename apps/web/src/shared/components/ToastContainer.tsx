import React from 'react';
import { X } from 'lucide-react';
import { useToast, Toast } from '../contexts/ToastContext';

const toastStyles = {
  success: 'bg-green-500 border-green-600 text-white',
  error: 'bg-destructive border-destructive/80 text-white',
  info: 'bg-primary border-primary/80 text-primary-foreground',
  loading: 'bg-muted border-border text-foreground',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto min-w-[300px] max-w-md border rounded-lg shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-right-4 fade-in duration-300 ${toastStyles[toast.type]}`}
          role="alert"
          aria-live="polite"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium break-words">{toast.message}</p>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-2 text-sm underline opacity-90 hover:opacity-100"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          {toast.type !== 'loading' && (
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
