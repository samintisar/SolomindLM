import { CheckCircle2, Circle } from "lucide-react";
import type React from "react";
import { cn } from "@/shared/utils/cn";

interface Props {
  label: string;
  hint?: string;
  done: boolean;
}

export const ChecklistItem: React.FC<Props> = ({ label, hint, done }) => (
  <li className="flex items-start gap-3 py-1.5">
    {done ? (
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary animate-in zoom-in-50 duration-200 ease-spring" />
    ) : (
      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )}
    <div className="min-w-0">
      <span
        className={cn("text-sm", done ? "text-muted-foreground line-through" : "text-foreground")}
      >
        {label}
      </span>
      {hint && !done && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  </li>
);
