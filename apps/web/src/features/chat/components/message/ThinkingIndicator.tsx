import { getStatusIcon, getStatusMessage } from "../../utils/messageStatus";

/** Pending-answer indicator: the phase label shimmers, three dots bounce in sequence. */
export function ThinkingIndicator({ status }: { status?: string }) {
  const label = getStatusMessage(status) ?? "Thinking";
  const icon = getStatusIcon(status);
  return (
    <div
      role="status"
      aria-label={label}
      className="flex items-center gap-2 py-2 font-sans text-sm text-muted-foreground"
    >
      {icon ? (
        <span className="flex shrink-0" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="text-shimmer">{label}…</span>
      <span className="flex items-end gap-1 pb-0.5" aria-hidden>
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground delay-0" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground delay-150" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground delay-300" />
      </span>
    </div>
  );
}
