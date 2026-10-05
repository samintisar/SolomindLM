import type React from "react";
import { cn } from "@/shared/utils/cn";

interface FlipCardProps {
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  /** Small line under each face ("Tap or Space to flip"). */
  frontFooter?: React.ReactNode;
  backFooter?: React.ReactNode;
  /** Makes the card a button (click, Enter, Space). */
  onActivate?: () => void;
  label?: string;
  /** "edit" rings the card in the primary colour. */
  tone?: "default" | "edit";
  className?: string;
}

// The swap lands when the card is edge-on: the house ease-out reaches 90° about 245ms into the
// 700ms turn. backface-visibility alone is unreliable (composited children such as the scroll area
// can bleed through mirrored), so the hidden face is also made invisible. Under reduced motion
// nothing turns and the faces cross-fade over 200ms.
const FACE =
  "absolute inset-0 flex flex-col items-center overflow-hidden rounded-2xl p-5 text-center shadow-lg ring-1 ring-hairline backface-hidden transition-all delay-245 duration-0 data-[shown=false]:invisible data-[shown=false]:opacity-0 sm:p-6 motion-reduce:delay-0 motion-reduce:duration-200";

export function FlipCard({
  flipped,
  front,
  back,
  frontFooter,
  backFooter,
  onActivate,
  label,
  tone = "default",
  className,
}: FlipCardProps) {
  const interactive = Boolean(onActivate);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (!onActivate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group h-72 w-full shrink-0 rounded-2xl outline-hidden perspective-distant focus-visible:ring-2 focus-visible:ring-ring sm:h-80",
        interactive && "cursor-pointer",
        className
      )}
    >
      <div
        data-flipped={flipped}
        className="relative size-full rounded-2xl transition-transform duration-700 ease-out transform-3d group-hover:-translate-y-1 data-[flipped=true]:rotate-y-180 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:data-[flipped=true]:rotate-y-0"
      >
        <div
          data-face="front"
          data-shown={!flipped}
          className={cn(FACE, "bg-card", tone === "edit" && "ring-2 ring-primary/40")}
        >
          <span className="mb-2 shrink-0 font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Question
          </span>
          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full w-full flex-col items-center justify-center py-1 text-base font-medium text-foreground sm:text-lg">
              {front}
            </div>
          </div>
          {frontFooter}
        </div>
        <div
          data-face="back"
          data-shown={flipped}
          className={cn(
            FACE,
            "bg-muted/40 rotate-y-180 motion-reduce:rotate-y-0",
            tone === "edit" && "ring-2 ring-primary/40"
          )}
        >
          <span className="mb-2 shrink-0 font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Answer
          </span>
          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full w-full flex-col items-center justify-center py-1 text-base font-medium text-foreground sm:text-lg">
              {back}
            </div>
          </div>
          {backFooter}
        </div>
      </div>
    </div>
  );
}
