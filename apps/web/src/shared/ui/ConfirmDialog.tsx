import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import type { ConfirmVariant } from "./confirmStore";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** Gets focus back on close; Radix would otherwise return it to a trigger this dialog lacks. */
  returnFocusTo?: HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_VARIANT = {
  danger: "destructive",
  warning: "warning",
  default: "default",
} as const satisfies Record<ConfirmVariant, string>;

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  returnFocusTo,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        // Escape and Cancel close through here; Confirm resolves first, so this is then a no-op.
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // The opener can be gone (e.g. a menu item); then keep Radix's default.
          if (returnFocusTo?.isConnected) {
            e.preventDefault();
            returnFocusTo.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {typeof message === "string" ? (
            <AlertDialogDescription>{message}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription asChild>
              <div>{message}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction variant={ACTION_VARIANT[variant]} onClick={onConfirm}>
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
