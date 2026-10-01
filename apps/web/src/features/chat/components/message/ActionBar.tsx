import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import { ControlTooltip } from "../ControlTooltip";

export type MessageFeedback = "up" | "down";

interface ActionBarProps {
  copied: boolean;
  onCopy: () => void;
  /** Omit to hide Retry. */
  onRetry?: () => void;
  feedback?: MessageFeedback;
  /** Omit to hide the feedback pair. Receives the next value (null clears it). */
  onFeedback?: (next: MessageFeedback | null) => void;
  className?: string;
}

/**
 * Icon actions under a message. Hidden (and not tappable) until the message is hovered or the bar
 * holds focus on fine pointers; always visible on coarse pointers, where there is no hover. A plain labelled group, not a
 * `role="toolbar"`: there is no arrow-key roving, so Tab moves through the buttons.
 */
export function ActionBar({
  copied,
  onCopy,
  onRetry,
  feedback,
  onFeedback,
  className,
}: ActionBarProps) {
  const copyLabel = copied ? "Copied" : "Copy";
  return (
    <div
      role="group"
      aria-label="Message actions"
      className={cn(
        // Hidden actions must not take taps (a touch laptop has a fine pointer and no hover). Focus
        // is unaffected by pointer-events, so keyboard users still reach them via focus-within.
        "pointer-events-none flex items-center gap-0.5 opacity-0 transition-opacity duration-200 ease-out",
        "focus-within:pointer-events-auto focus-within:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
        className
      )}
    >
      <ControlTooltip label={copyLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-10"
          aria-label={copyLabel}
          onClick={onCopy}
        >
          {copied ? <Check className="text-primary" aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </ControlTooltip>
      {onRetry ? (
        <ControlTooltip label="Retry">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-10"
            aria-label="Retry"
            onClick={onRetry}
          >
            <RotateCcw aria-hidden />
          </Button>
        </ControlTooltip>
      ) : null}
      {onFeedback ? (
        <>
          <ControlTooltip label="Helpful">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-10"
              aria-label="Helpful"
              aria-pressed={feedback === "up"}
              onClick={() => onFeedback(feedback === "up" ? null : "up")}
            >
              <ThumbsUp
                className={cn(feedback === "up" && "fill-success/30 text-success-muted-foreground")}
                aria-hidden
              />
            </Button>
          </ControlTooltip>
          <ControlTooltip label="Not helpful">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-10"
              aria-label="Not helpful"
              aria-pressed={feedback === "down"}
              onClick={() => onFeedback(feedback === "down" ? null : "down")}
            >
              <ThumbsDown
                className={cn(
                  feedback === "down" && "fill-destructive/30 text-destructive-muted-foreground"
                )}
                aria-hidden
              />
            </Button>
          </ControlTooltip>
        </>
      ) : null}
    </div>
  );
}
