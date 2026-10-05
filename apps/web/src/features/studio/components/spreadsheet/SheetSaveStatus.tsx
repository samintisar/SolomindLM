import type { ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import type { SaveState } from "./useSheetAutosave";

interface SheetSaveStatusProps {
  state: SaveState;
  /** When someone last edited the sheet (ms since epoch), from the server. */
  editedAt?: number;
  onRetry: () => void;
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", className)} />;
}

/**
 * The sheet header's save status: "Saving…", "Saved · Edited" or "Couldn't save · Retry". The live
 * region stays mounted while empty, so the first status after it is announced.
 */
export function SheetSaveStatus({ state, editedAt, onRetry }: SheetSaveStatusProps) {
  let content: ReactNode = null;
  if (state === "saving") {
    content = (
      <>
        <Dot className="animate-pulse bg-muted-foreground" />
        Saving…
      </>
    );
  } else if (state === "error") {
    content = (
      <>
        <Dot className="bg-destructive" />
        Couldn't save ·{" "}
        <Button variant="link" size="xs" type="button" onClick={onRetry}>
          Retry
        </Button>
      </>
    );
  } else if (state === "saved" || editedAt !== undefined) {
    content = (
      <>
        <Dot className="bg-success" />
        Saved ·{" "}
        <span title={editedAt === undefined ? undefined : new Date(editedAt).toLocaleString()}>
          Edited
        </span>
      </>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex shrink-0 items-center gap-1.5 font-sans text-xs text-muted-foreground"
    >
      {content}
    </span>
  );
}
