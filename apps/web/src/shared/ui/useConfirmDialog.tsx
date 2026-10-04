import React from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { type ConfirmStore, type ConfirmVariant, createConfirmStore } from "./confirmStore";

function ConfirmDialogHost({ store }: { store: ConfirmStore }) {
  const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      variant={state.variant}
      returnFocusTo={state.returnFocusTo}
      onConfirm={() => store.finish(true)}
      onCancel={() => store.finish(false)}
    />
  );
}

export const useConfirmDialog = () => {
  const [store] = React.useState(createConfirmStore);

  const confirm = React.useCallback(
    (
      title: string,
      message: React.ReactNode,
      options?: { confirmText?: string; cancelText?: string; variant?: ConfirmVariant }
    ): Promise<boolean> =>
      new Promise((resolve) => {
        store.open(
          {
            title,
            message,
            confirmText: options?.confirmText,
            cancelText: options?.cancelText,
            variant: options?.variant ?? "default",
            returnFocusTo:
              document.activeElement instanceof HTMLElement ? document.activeElement : null,
          },
          resolve
        );
      }),
    [store]
  );

  // A stable component type: the dialog stays mounted between confirms, so Radix animates the
  // close and returns focus to the element that opened it.
  const ConfirmDialogComponent = React.useMemo(
    () =>
      function ConfirmDialog() {
        return <ConfirmDialogHost store={store} />;
      },
    [store]
  );

  return { confirm, ConfirmDialogComponent };
};
