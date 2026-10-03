import type { FolderItem } from "@/shared/types/index";
import { CoverCustomizeDialog } from "./CoverCustomizeDialog";

interface CustomizeFolderModalProps {
  folder?: FolderItem;
  onClose: () => void;
  onSave: (data: { name: string; color: string; icon: string }) => void | Promise<void>;
}

export function CustomizeFolderModal({ folder, onClose, onSave }: CustomizeFolderModalProps) {
  return (
    <CoverCustomizeDialog
      kind="folder"
      initial={folder && { name: folder.name, color: folder.color ?? "", icon: folder.icon ?? "" }}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
