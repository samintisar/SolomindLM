import React from "react";
import { Download, FileText, Pin, Settings2 } from "lucide-react";
import { DropdownMenu } from "@/shared/ui/DropdownMenu";

interface ChatToolbarProps {
  onConfigure: () => void;
  onExport: () => void;
  onSaveToNote: () => void;
  onPin: () => void;
  isPinned: boolean;
}

export const ChatToolbar: React.FC<ChatToolbarProps> = ({
  onConfigure,
  onExport,
  onSaveToNote,
  onPin,
  isPinned,
}) => {
  return (
    <DropdownMenu
      align="right"
      trigger={
        <button
          className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
          title="Chat options"
          type="button"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      }
    >
      <div className="py-1">
        <button
          onClick={onConfigure}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>Configure chat</span>
        </button>
        <button
          onClick={onExport}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          <Download className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>Export chat</span>
        </button>
        <button
          onClick={onSaveToNote}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>Save to note</span>
        </button>
        <div className="my-1 border-t border-border" />
        <button
          onClick={onPin}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          <Pin className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{isPinned ? "Unpin chat" : "Pin chat"}</span>
        </button>
      </div>
    </DropdownMenu>
  );
};
