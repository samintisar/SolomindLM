import React from "react";
import { AlertTriangle, X } from "lucide-react";

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

  const iconColors = {
    danger: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/10",
    default: "text-primary bg-primary/10",
  };

  const confirmButtonStyles = {
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${iconColors[variant]}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-sans">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-secondary/50 rounded-xl transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="text-sm text-foreground leading-relaxed">
            {typeof message === "string" ? <p>{message}</p> : message}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 pt-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${confirmButtonStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Hook for using the dialog
export const useConfirmDialog = () => {
  const [state, setState] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "default";
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
  });

  const confirm = React.useCallback(
    (
      title: string,
      message: string | React.ReactNode,
      options?: {
        confirmText?: string;
        cancelText?: string;
        variant?: "danger" | "warning" | "default";
      }
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          title,
          message,
          confirmText: options?.confirmText,
          cancelText: options?.cancelText,
          variant: options?.variant || "default",
          onConfirm: () => {
            setState((prev) => ({ ...prev, isOpen: false }));
            resolve(true);
          },
        });
      });
    },
    []
  );

  const Dialog = React.useCallback(() => {
    const handleCancel = () => {
      setState((prev) => ({ ...prev, isOpen: false }));
    };

    return (
      <ConfirmDialog
        isOpen={state.isOpen}
        title={state.title}
        message={state.message}
        confirmText={state.confirmText}
        cancelText={state.cancelText}
        variant={state.variant}
        onConfirm={() => state.onConfirm?.()}
        onCancel={handleCancel}
      />
    );
  }, [state]);

  return { confirm, ConfirmDialogComponent: Dialog };
};
