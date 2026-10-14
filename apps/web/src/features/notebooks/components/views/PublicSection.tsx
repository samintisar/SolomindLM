import { useId } from "react";
import { Button } from "@/shared/components/ui/button";
import type { NotebookItem } from "@/shared/types/index";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { GridSkeleton } from "../home/GridSkeleton";
import { ListHeader } from "../ListHeader";

/** `usePaginatedQuery` status of the Community grid. */
type CommunityStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

interface PublicSectionProps {
  featured: NotebookItem[];
  /** The Featured shelf's query hasn't returned yet. */
  featuredLoading: boolean;
  community: NotebookItem[];
  communityStatus: CommunityStatus;
  onLoadMore: () => void;
  viewMode: ViewMode;
  onSelectNotebook: (notebook: NotebookItem) => void;
  isAdmin: boolean;
  onToggleFeatured: (notebook: NotebookItem) => void;
  onUnpublish: (notebook: NotebookItem) => void;
  /** On the All tab: just the curated shelf. */
  featuredOnly?: boolean;
}

function Shelf({
  heading,
  notebooks,
  props,
}: {
  heading: string;
  notebooks: NotebookItem[];
  props: PublicSectionProps;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="font-display text-lg font-semibold text-foreground">
        {heading}
      </h2>
      {props.viewMode === "list" && <ListHeader />}
      <CardGrid viewMode={props.viewMode}>
        {notebooks.map((nb, i) => (
          <CardGridItem key={nb.id} index={i}>
            <NotebookCard
              notebook={nb}
              viewMode={props.viewMode}
              onSelectNotebook={props.onSelectNotebook}
              variant="public"
              adminActions={
                props.isAdmin
                  ? {
                      onToggleFeatured: () => props.onToggleFeatured(nb),
                      onUnpublish: () => props.onUnpublish(nb),
                    }
                  : undefined
              }
            />
          </CardGridItem>
        ))}
      </CardGrid>
    </section>
  );
}

/** Public notebooks: the admin-curated Featured shelf, then the Community grid. */
export function PublicSection(props: PublicSectionProps) {
  const { featured, featuredLoading, community, communityStatus, featuredOnly } = props;

  if (featuredOnly) {
    return !featuredLoading && featured.length > 0 ? (
      <Shelf heading="Featured" notebooks={featured} props={props} />
    ) : null;
  }

  // While loading, an empty list means "not loaded yet", not "none".
  if (featuredLoading || communityStatus === "LoadingFirstPage") return <GridSkeleton />;

  if (featured.length === 0 && community.length === 0) {
    return (
      <p className="py-12 text-center font-sans text-sm text-muted-foreground">
        No public notebooks yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {featured.length > 0 && <Shelf heading="Featured" notebooks={featured} props={props} />}
      {community.length > 0 && <Shelf heading="Community" notebooks={community} props={props} />}
      {(communityStatus === "CanLoadMore" || communityStatus === "LoadingMore") && (
        <Button
          variant="outline"
          className="self-center"
          disabled={communityStatus === "LoadingMore"}
          onClick={props.onLoadMore}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
