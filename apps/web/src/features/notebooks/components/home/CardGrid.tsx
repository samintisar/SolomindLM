import type { ReactNode } from "react";
import { AnimatePresence, LayoutItem } from "@/shared/components/motion";
import { cn } from "@/shared/utils/cn";
import { GRID_CLASS } from "./gridClass";

export type ViewMode = "grid" | "list";

const LIST_CLASS = "flex flex-col gap-2";

// Static list so Tailwind sees every class; ~40ms steps for the first 12 cards only.
const STAGGER = [
  "delay-0",
  "delay-40",
  "delay-80",
  "delay-120",
  "delay-160",
  "delay-200",
  "delay-240",
  "delay-280",
  "delay-320",
  "delay-360",
  "delay-400",
  "delay-440",
] as const;
const ENTER = "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-320 ease-out";

/** `initial={false}`: the first paint uses the CSS entrance; motion only handles reorders/exits. */
export function CardGrid({ viewMode, children }: { viewMode: ViewMode; children: ReactNode }) {
  return (
    <div className={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}

/**
 * The CSS entrance sits on an inner element: CSS animations override inline styles, so on the
 * same node they would mask motion's layout transform for the first ~760ms.
 */
export function CardGridItem({ index, children }: { index: number; children: ReactNode }) {
  return (
    <LayoutItem className="h-full">
      <div className={cn("h-full", ENTER, STAGGER[index])}>{children}</div>
    </LayoutItem>
  );
}
