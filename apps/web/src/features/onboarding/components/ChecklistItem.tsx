import { CheckCircle2, Circle } from "lucide-react";
import React from "react";

interface Props {
  label: string;
  hint?: string;
  done: boolean;
}

export const ChecklistItem: React.FC<Props> = ({ label, hint, done }) => (
  <li className="flex items-start gap-3 py-1.5">
    {done ? (
      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
    ) : (
      <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
    )}
    <div className="min-w-0">
      <span
        className={`text-sm ${done ? "line-through text-muted-foreground" : "text-foreground"}`}
      >
        {label}
      </span>
      {hint && !done && <p className="text-xs text-muted-foreground/80 mt-0.5">{hint}</p>}
    </div>
  </li>
);
