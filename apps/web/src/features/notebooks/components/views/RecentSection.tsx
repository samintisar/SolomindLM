import React from "react";
import { Plus, FolderInput } from "lucide-react";
import { NotebookItem, FolderItem } from "@/shared/types/index";
import { NotebookCard } from "../cards/NotebookCard";
import { FolderCard } from "../cards/FolderCard";
import { ListHeader } from "../ListHeader";

interface RecentSectionProps {
  recentNotebooks: NotebookItem[];
  folders: FolderItem[];
  viewMode: "grid" | "list";
  onCreateNotebook: () => void;
  onCreateFolder?: () => void;
  onSelectNotebook: (notebook: NotebookItem) => void;
  onSelectFolder: (folderId: string) => void;
  // Notebook handlers
  activeMenuId: string | null;
  onOpenCustomize: (id: string) => void;
  onOpenMoveToFolder: (id: string) => void;
  onDeleteNotebook: (id: string) => void;
  setActiveMenuId: (id: string | null) => void;
  // Folder handlers
  folderActiveMenuId: string | null;
  onOpenFolderCustomize: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  setFolderActiveMenuId: (id: string | null) => void;
  // Sorting
  getSortedNotebooks?: (items: NotebookItem[]) => NotebookItem[];
}

export const RecentSection: React.FC<RecentSectionProps> = ({
  recentNotebooks,
  folders,
  viewMode,
  onCreateNotebook,
  onCreateFolder,
  onSelectNotebook,
  onSelectFolder,
  // Notebook handlers
  activeMenuId,
  onOpenCustomize,
  onOpenMoveToFolder,
  onDeleteNotebook,
  setActiveMenuId,
  // Folder handlers
  folderActiveMenuId,
  onOpenFolderCustomize,
  onDeleteFolder,
  setFolderActiveMenuId,
  // Sorting
  getSortedNotebooks: _getSortedNotebooks,
}) => {
  // Filter notebooks without folders for main display
  const notebooksWithoutFolder = recentNotebooks.filter((nb) => !nb.folderId);

  return (
    <section className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-bold text-foreground">My Notebooks</h2>
      </div>

      {viewMode === "grid" ? (
        /* RECENT GRID */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Create Buttons */}
          {onCreateFolder && (
            <div
              onClick={onCreateFolder}
              className="group aspect-16/10 rounded-2xl border-2 border-dashed border-border hover:border-blue-500 hover:bg-blue-500/5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-xl bg-secondary text-blue-500 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300 shadow-sm">
                <FolderInput className="w-7 h-7" />
              </div>
              <span className="text-base font-bold text-muted-foreground group-hover:text-blue-500 transition-colors font-sans">
                Create new folder
              </span>
            </div>
          )}
          <div
            data-onboarding="create-notebook-button"
            onClick={onCreateNotebook}
            className="group aspect-16/10 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-xl bg-secondary text-primary flex items-center justify-center group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
              <Plus className="w-7 h-7" />
            </div>
            <span className="text-base font-bold text-muted-foreground group-hover:text-primary transition-colors font-sans">
              Create new notebook
            </span>
          </div>

          {/* Folder Cards */}
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              viewMode={viewMode}
              isMenuOpen={folderActiveMenuId === folder.id}
              onSelectFolder={() => onSelectFolder(folder.id)}
              onOpenFolderCustomize={() => onOpenFolderCustomize(folder.id)}
              onDeleteFolder={onDeleteFolder}
              onToggleMenu={() =>
                setFolderActiveMenuId(folderActiveMenuId === folder.id ? null : folder.id)
              }
              onCloseMenu={() => setFolderActiveMenuId(null)}
            />
          ))}

          {/* Notebook Cards */}
          {notebooksWithoutFolder.map((nb) => (
            <NotebookCard
              key={nb.id}
              notebook={nb}
              viewMode={viewMode}
              isMenuOpen={activeMenuId === nb.id}
              onSelectNotebook={onSelectNotebook}
              onOpenCustomize={() => onOpenCustomize(nb.id)}
              onOpenMoveToFolder={() => onOpenMoveToFolder(nb.id)}
              onDeleteNotebook={onDeleteNotebook}
              onToggleMenu={() => setActiveMenuId(activeMenuId === nb.id ? null : nb.id)}
              onCloseMenu={() => setActiveMenuId(null)}
            />
          ))}
        </div>
      ) : (
        /* RECENT LIST */
        <div className="flex flex-col gap-0">
          <ListHeader />

          {/* Create New Folder Row */}
          {onCreateFolder && (
            <div
              onClick={onCreateFolder}
              className="grid grid-cols-[minmax(200px,1fr)_140px_100px_48px] gap-4 items-center p-4 mb-2 rounded-lg border border-dashed border-border/50 hover:bg-blue-500/10 hover:border-blue-500/50 cursor-pointer group transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-md bg-secondary text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <FolderInput className="w-4 h-4 shrink-0" />
                </div>
                <span className="font-medium text-muted-foreground group-hover:text-blue-500 transition-colors font-sans whitespace-nowrap">
                  Create new folder
                </span>
              </div>
            </div>
          )}

          {/* Create New Notebook Row */}
          <div
            onClick={onCreateNotebook}
            className="grid grid-cols-[minmax(200px,1fr)_140px_100px_48px] gap-4 items-center p-4 mb-2 rounded-lg border border-dashed border-border/50 hover:bg-secondary/20 hover:border-primary/50 cursor-pointer group transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-md bg-secondary text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Plus className="w-4 h-4 shrink-0" />
              </div>
              <span className="font-medium text-muted-foreground group-hover:text-foreground transition-colors font-sans whitespace-nowrap">
                Create new notebook
              </span>
            </div>
          </div>

          {/* Folder Rows */}
          {folders.map((folder) => (
            <div key={folder.id} className="mb-2">
              <FolderCard
                folder={folder}
                viewMode={viewMode}
                isMenuOpen={folderActiveMenuId === folder.id}
                onSelectFolder={() => onSelectFolder(folder.id)}
                onOpenFolderCustomize={() => onOpenFolderCustomize(folder.id)}
                onDeleteFolder={onDeleteFolder}
                onToggleMenu={() =>
                  setFolderActiveMenuId(folderActiveMenuId === folder.id ? null : folder.id)
                }
                onCloseMenu={() => setFolderActiveMenuId(null)}
              />
            </div>
          ))}

          {/* Notebook Rows */}
          {notebooksWithoutFolder.map((nb) => (
            <div key={nb.id} className="mb-2">
              <NotebookCard
                notebook={nb}
                viewMode={viewMode}
                isMenuOpen={activeMenuId === nb.id}
                onSelectNotebook={onSelectNotebook}
                onOpenCustomize={() => onOpenCustomize(nb.id)}
                onOpenMoveToFolder={() => onOpenMoveToFolder(nb.id)}
                onDeleteNotebook={onDeleteNotebook}
                onToggleMenu={() => setActiveMenuId(activeMenuId === nb.id ? null : nb.id)}
                onCloseMenu={() => setActiveMenuId(null)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
