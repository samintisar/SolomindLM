import { Check } from "lucide-react";
import { cn } from "@/shared/utils/cn";

/** Small checked lines under a sign-up button. */
export function FinePrint({ lines, className }: { lines: readonly string[]; className?: string }) {
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-5 gap-y-2 font-sans text-xs text-muted-foreground",
        className
      )}
    >
      {lines.map((line) => (
        <li key={line} className="flex items-center gap-1.5">
          <Check aria-hidden className="size-3.5 text-success" />
          {line}
        </li>
      ))}
    </ul>
  );
}
