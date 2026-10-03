import type { NotebookItem } from "@/shared/types/index";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { ListHeader } from "../ListHeader";

interface FeaturedSectionProps {
  featuredNotebooks: NotebookItem[];
  viewMode: ViewMode;
  onSelectNotebook: (notebook: NotebookItem) => void;
  /** On the Featured tab, say so instead of rendering nothing. */
  showEmpty?: boolean;
}

export function FeaturedSection({
  featuredNotebooks,
  viewMode,
  onSelectNotebook,
  showEmpty,
}: FeaturedSectionProps) {
  if (featuredNotebooks.length === 0) {
    return showEmpty ? (
      <p className="py-12 text-center font-sans text-sm text-muted-foreground">
        No featured notebooks yet.
      </p>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-foreground">Featured notebooks</h2>
      {viewMode === "list" && <ListHeader />}
      <CardGrid viewMode={viewMode}>
        {featuredNotebooks.map((nb, i) => (
          <CardGridItem key={nb.id} index={i}>
            <NotebookCard
              notebook={nb}
              viewMode={viewMode}
              onSelectNotebook={onSelectNotebook}
              featured
            />
          </CardGridItem>
        ))}
      </CardGrid>
    </section>
  );
}
