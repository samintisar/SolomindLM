import type { RefHandlers } from "../utils/messageRendering.utils";

/**
 * Inline citation pill. With handlers it is a keyboard- and touch-operable button that drives the
 * panel's citation popover; without them it is a plain label. `title="Reference N"` is an e2e hook.
 */
export function CitationChip({
  refId,
  messageId,
  handlers,
}: {
  refId: number;
  messageId: string;
  handlers?: RefHandlers;
}) {
  if (!handlers) {
    return (
      <span
        title={`Reference ${refId}`}
        className="mx-1 inline-flex size-5 items-center justify-center rounded-full bg-primary align-middle font-sans text-xs font-bold text-primary-foreground"
      >
        {refId}
      </span>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      data-citation-chip=""
      data-cite-message-id={messageId}
      data-ref-id={refId}
      title={`Reference ${refId}`}
      aria-label={`Reference ${refId}`}
      onPointerEnter={(e) =>
        e.pointerType === "mouse" && handlers.onRefEnter(refId, messageId, e.currentTarget)
      }
      onPointerLeave={(e) => e.pointerType === "mouse" && handlers.onRefLeave()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handlers.onRefToggle(refId, messageId, e.currentTarget, "pointer");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          // A held key would re-toggle (and could activate the card's first control).
          if (e.repeat) return;
          handlers.onRefToggle(refId, messageId, e.currentTarget, "keyboard");
        }
      }}
      className="mx-1 inline-flex size-5 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-primary align-middle font-sans text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/80"
    >
      {refId}
    </span>
  );
}
