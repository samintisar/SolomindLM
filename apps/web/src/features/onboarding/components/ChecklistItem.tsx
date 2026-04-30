import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

interface Props {
  label: string;
  done: boolean;
}

export const ChecklistItem: React.FC<Props> = ({ label, done }) => (
  <li className="flex items-center gap-3 py-1.5">
    {done ? (
      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
    ) : (
      <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
    )}
    <span
      className={`text-sm ${done ? "line-through text-muted-foreground" : "text-foreground"}`}
    >
      {label}
    </span>
  </li>
);
