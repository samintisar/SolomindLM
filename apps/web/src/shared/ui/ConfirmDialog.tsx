import React from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const confirmButtonStyles = {
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
  };

  const content = (
    <div
      data-confirm-dialog-root
      className="fixed inset-0 z-300 flex items-center justify-center p-4 font-sans antialiased"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[1px] animate-in fade-in duration-150"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 text-left shadow-lg animate-in fade-in zoom-in-95 duration-150"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold leading-snug tracking-tight text-foreground"
        >
          {title}
        </h2>
        <div
          id="confirm-dialog-desc"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          {typeof message === "string" ? <p className="m-0">{message}</p> : message}
        </div>

        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/80 sm:w-auto"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-9 w-full min-w-20 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors sm:w-auto ${confirmButtonStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
