import { useId } from "react";
import type { FolderItem, NotebookItem } from "@/shared/types/index";
import { FolderCard } from "../cards/FolderCard";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { GridSkeleton } from "../home/GridSkeleton";
import { HomeEmptyState } from "../home/HomeEmptyState";
import { ListHeader } from "../ListHeader";

interface RecentSectionProps {
  recentNotebooks: NotebookItem[];
  folders: FolderItem[];
  viewMode: ViewMode;
  isLoading: boolean;
  onCreateNotebook: () => void;
  onSelectNotebook: (notebook: NotebookItem) => void;
  onSelectFolder: (folderId: string) => void;
  onOpenCustomize: (id: string) => void;
  onOpenMoveToFolder: (id: string) => void;
  onDeleteNotebook: (id: string) => void;
  onOpenFolderCustomize: (id: string) => void;
  onDeleteFolder: (id: string) => void;
}

export function RecentSection(props: RecentSectionProps) {
  const { folders, viewMode } = props;
  // Notebooks inside a folder show in that folder, not on the home grid.
  const notebooks = props.recentNotebooks.filter((nb) => !nb.folderId);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="font-display text-lg font-semibold text-foreground">
        My notebooks
      </h2>
      {props.isLoading ? (
        <GridSkeleton />
      ) : folders.length === 0 && notebooks.length === 0 ? (
        <HomeEmptyState onCreateNotebook={props.onCreateNotebook} />
      ) : (
        <>
          {viewMode === "list" && <ListHeader />}
          <CardGrid viewMode={viewMode}>
            {folders.map((folder, i) => (
              <CardGridItem key={`folder-${folder.id}`} index={i}>
                <FolderCard
                  folder={folder}
                  viewMode={viewMode}
                  onSelectFolder={() => props.onSelectFolder(folder.id)}
                  onOpenFolderCustomize={() => props.onOpenFolderCustomize(folder.id)}
                  onDeleteFolder={props.onDeleteFolder}
                />
              </CardGridItem>
            ))}
            {notebooks.map((nb, i) => (
              <CardGridItem key={nb.id} index={folders.length + i}>
                <NotebookCard
                  notebook={nb}
                  viewMode={viewMode}
                  onSelectNotebook={props.onSelectNotebook}
                  onOpenCustomize={() => props.onOpenCustomize(nb.id)}
                  onOpenMoveToFolder={() => props.onOpenMoveToFolder(nb.id)}
                  onDeleteNotebook={props.onDeleteNotebook}
                />
              </CardGridItem>
            ))}
          </CardGrid>
        </>
      )}
    </section>
  );
}
