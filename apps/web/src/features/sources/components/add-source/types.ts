import { useEffect } from "react";

export type AddSourceStep = "menu" | "website" | "video" | "text" | "doi" | "bibtex" | "manual";

/** Contract between AddSourceDialog and each step's form. */
export interface StepFormProps {
  /** Close the whole dialog after a successful add. */
  onDone: () => void;
  /** Report in-flight work so the dialog can block closing. */
  onBusyChange: (busy: boolean) => void;
}

/** Mirror `busy` to the dialog, and clear it when the form unmounts. */
export function useReportBusy(busy: boolean, onBusyChange: (busy: boolean) => void) {
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
}
