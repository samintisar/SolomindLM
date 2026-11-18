import React from "react";
import {
  X,
  Folder,
  FolderOpen,
  Book,
  BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
} from "lucide-react";
import { FolderItem } from "@/shared/types/index";

const IconMap: Record<string, React.FC<any>> = {
  Folder,
  Book,
  BarChart: BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
};

interface MoveToFolderModalProps {
  notebookId: string;
  folders: FolderItem[];
  onClose: () => void;
  onMove: (notebookId: string, folderId: string | null) => void;
}

export const MoveToFolderModal: React.FC<MoveToFolderModalProps> = ({
  notebookId,
  folders,
  onClose,
  onMove,
}) => {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-bold font-sans">Move to folder</h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-xl transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Folder List */}
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          <button
            onClick={() => onMove(notebookId, null)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-bold text-foreground">No Folder</div>
              <div className="text-xs text-muted-foreground">Remove from folder</div>
            </div>
          </button>

          {folders.map((folder) => {
            const FolderIcon = folder.icon ? IconMap[folder.icon] : Folder;
            return (
              <button
                key={folder.id}
                onClick={() => onMove(notebookId, folder.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors text-left"
              >
                <div
                  className={`w-10 h-10 rounded-lg ${folder.color || "bg-blue-500"} bg-opacity-20 flex items-center justify-center`}
                >
                  <FolderIcon
                    className={`w-5 h-5 ${(folder.color || "").replace("bg-", "text-")}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground truncate">{folder.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {folder.notebookCount} notebooks
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
