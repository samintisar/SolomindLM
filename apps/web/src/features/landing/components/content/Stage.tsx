import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

/** The soft muted panel the home beats put product pictures on. Layout classes come from the caller. */
export function Stage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-3xl bg-muted/40 p-5 ring-1 ring-hairline ring-inset sm:p-8 lg:p-10",
        className
      )}
    >
      {children}
    </div>
  );
}
