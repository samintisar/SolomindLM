import React from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export const useConfirmDialog = () => {
  const [state, setState] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "default";
  }>({
    isOpen: false,
    title: "",
    message: "",
  });

  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const finish = React.useCallback((result: boolean) => {
    setState((prev) => ({ ...prev, isOpen: false }));
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }, []);

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
        resolveRef.current = resolve;
        setState({
          isOpen: true,
          title,
          message,
          confirmText: options?.confirmText,
          cancelText: options?.cancelText,
          variant: options?.variant || "default",
        });
      });
    },
    []
  );

  const Dialog = React.useCallback(() => {
    return (
      <ConfirmDialog
        isOpen={state.isOpen}
        title={state.title}
        message={state.message}
        confirmText={state.confirmText}
        cancelText={state.cancelText}
        variant={state.variant}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    );
  }, [state, finish]);

  return { confirm, ConfirmDialogComponent: Dialog };
};
