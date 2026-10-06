import { Check } from "lucide-react";
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
  /**
   * A second action in the top-right corner, outside the main button (Edit prompt). The selected
   * check then moves to the top-left corner.
   */
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
  // In a single-choice picker without media, the title leaves room for the check in its corner.
  const reserveCheck = selected !== undefined && !media;
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
          className={cn(
            "font-sans text-sm font-semibold text-foreground",
            action && "pr-8",
            reserveCheck && (action ? "pl-6" : "pr-6")
          )}
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
      {/* The ring alone is too faint to mark the choice; aria-pressed already announces it. */}
      {selected && (
        <span
          aria-hidden
          data-slot="option-card-check"
          className={cn(
            "pointer-events-none absolute top-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground",
            action ? "left-2" : "right-2"
          )}
        >
          <Check className="size-3.5" />
        </span>
      )}
      {action && <div className="absolute top-2 right-2">{action}</div>}
    </Card>
  );
}
