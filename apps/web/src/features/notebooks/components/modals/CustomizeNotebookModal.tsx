import type { NotebookItem } from "@/shared/types/index";
import { CoverCustomizeDialog } from "./CoverCustomizeDialog";

interface CustomizeNotebookModalProps {
  notebook?: NotebookItem;
  onClose: () => void;
  onSave: (data: { title: string; coverColor: string; icon: string }) => void | Promise<void>;
}

export function CustomizeNotebookModal({ notebook, onClose, onSave }: CustomizeNotebookModalProps) {
  return (
    <CoverCustomizeDialog
      kind="notebook"
      initial={
        notebook && {
          name: notebook.title,
          color: notebook.coverColor ?? "",
          icon: notebook.icon ?? "",
        }
      }
      onClose={onClose}
      onSave={({ name, color, icon }) => onSave({ title: name, coverColor: color, icon })}
    />
  );
}
