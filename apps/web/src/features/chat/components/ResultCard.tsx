import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card } from "@/shared/components/ui/card";

/** A finished artifact (table, report) that opens on click. The whole card is one labelled button. */
export function ResultCard({
  icon: Icon,
  title,
  description,
  onOpen,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  onOpen: () => void;
}) {
  return (
    <Card variant="interactive">
      <button
        type="button"
        onClick={onOpen}
        className="group flex items-center gap-3 p-3 text-left font-sans outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-sm font-semibold text-card-foreground">
            {title}
          </span>
          {description && (
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          )}
        </span>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-safe:group-hover:translate-x-0.5"
        />
      </button>
    </Card>
  );
}
