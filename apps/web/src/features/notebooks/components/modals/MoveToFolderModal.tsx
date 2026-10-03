import { FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import { folderIcon } from "@/shared/notebook/notebookIcons";
import type { FolderItem } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { folderMeta } from "../../notebookMeta";

interface MoveToFolderModalProps {
  notebookId: string;
  folders: FolderItem[];
  onClose: () => void;
  onMove: (notebookId: string, folderId: string | null) => void;
}

const ROW =
  "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export function MoveToFolderModal({
  notebookId,
  folders,
  onClose,
  onMove,
}: MoveToFolderModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription>Choose where this notebook lives.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 flex max-h-96 flex-col gap-1 overflow-y-auto">
          <button type="button" className={ROW} onClick={() => onMove(notebookId, null)}>
            <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
              <FolderOpen aria-hidden className="size-5 text-muted-foreground" />
            </span>
            <span>
              <span className="block font-sans text-sm font-semibold text-foreground">
                No folder
              </span>
              <span className="block text-xs text-muted-foreground">Show on the home page</span>
            </span>
          </button>
          {folders.map((folder) => {
            const Icon = folderIcon(folder.icon);
            return (
              <button
                key={folder.id}
                type="button"
                className={ROW}
                onClick={() => onMove(notebookId, folder.id)}
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg",
                    coverFillClass(folder.color)
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", COVER_ICON_CLASS)} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-sans text-sm font-semibold text-foreground">
                    {folder.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">{folderMeta(folder)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
