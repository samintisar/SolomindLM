import { type ReactNode, useId } from "react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";

interface OptionCardProps {
  title: string;
  description: string;
  onSelect: () => void;
  /** Single-choice pickers mark the chosen card. Omit it for cards that act straight away. */
  selected?: boolean;
  /** Shown above the title (the infographic style thumbnails). */
  media?: ReactNode;
  /** A second action in the top-right corner, outside the main button (Edit prompt). */
  action?: ReactNode;
}

/** A clickable card with a title and a short description: Studio formats and styles. */
export function OptionCard({
  title,
  description,
  onSelect,
  selected,
  media,
  action,
}: OptionCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Card variant="interactive" data-selected={selected || undefined} className="h-full">
      <button
        type="button"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        onClick={onSelect}
        className="flex h-full flex-col gap-2 rounded-2xl p-4 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {media}
        <span
          id={titleId}
          className={cn("font-sans text-sm font-semibold text-foreground", action && "pr-8")}
        >
          {title}
        </span>
        <span
          id={descriptionId}
          className="line-clamp-4 text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </span>
      </button>
      {action && <div className="absolute top-2 right-2">{action}</div>}
    </Card>
  );
}
