import React, { useRef, useEffect } from "react";
import {
  PanelLeftOpen,
  PanelRightOpen,
  History,
  Plus,
} from "lucide-react";
import { ConversationList } from "./ConversationList";
import { ChatToolbar } from "./ChatToolbar";

import type { Doc } from "@convex/_generated/dataModel";

interface ChatHeaderProps {
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  conversations: Doc<"conversations">[] | undefined;
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => Promise<void>;
  onDeleteConversation?: (id: string) => Promise<void>;
  pinnedIds: Set<string>;
  handleTogglePin: (convId: string) => void;
  handleNewConversation: () => Promise<void>;
  isCreatingConversation: boolean;
  handleExportChat: () => void;
  handleSaveToNote: () => void;
  handlePinActiveChat: () => void;
  isPinned: boolean;
  setIsConfigModalOpen: (v: boolean) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isLeftOpen,
  isRightOpen,
  toggleLeft,
  toggleRight,
  historyOpen,
  setHistoryOpen,
  conversations,
  activeConversationId,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  pinnedIds,
  handleTogglePin,
  handleNewConversation,
  isCreatingConversation,
  handleExportChat,
  handleSaveToNote,
  handlePinActiveChat,
  isPinned,
  setIsConfigModalOpen,
}) => {
  const historyContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setHistoryOpen(false);
        return;
      }
      const t = e.target as Node;
      if ((e.target as Element | null)?.closest?.("[data-thread-submenu-root]")) {
        return;
      }
      if ((e.target as Element | null)?.closest?.("[data-confirm-dialog-root]")) {
        return;
      }
      if (historyContainerRef.current && !historyContainerRef.current.contains(t)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [historyOpen, setHistoryOpen]);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="hidden md:flex items-center gap-2">
        {!isLeftOpen && (
          <button
            onClick={toggleLeft}
            className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
            title="Open Sources"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        {!isRightOpen && (
          <button
            data-onboarding="studio-panel-toggle"
            onClick={toggleRight}
            className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
            title="Open Studio"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        )}
      </div>
      <div ref={historyContainerRef} className="relative">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className={`p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0 ${
            historyOpen ? "ring-1 ring-border bg-accent" : ""
          }`}
          title="Thread history"
          aria-label="Thread history"
          aria-expanded={historyOpen}
        >
          <History className="w-4 h-4" />
        </button>

        {historyOpen && (
          <div
            role="dialog"
            aria-label="Thread history"
            className="absolute top-full right-0 mt-1.5 z-50 w-80 max-w-[calc(100vw-2rem)] bg-card font-sans text-sm antialiased border border-border/80 rounded-xl shadow-lg flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            style={{ maxHeight: "min(480px, calc(100vh - 100px))" }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              <ConversationList
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelect={(id) => {
                  onSelectConversation?.(id);
                  setHistoryOpen(false);
                }}
                onRename={onRenameConversation ?? (async () => {})}
                onDelete={onDeleteConversation ?? (async () => {})}
                pinnedIds={pinnedIds}
                onTogglePin={handleTogglePin}
              />
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleNewConversation}
        disabled={isCreatingConversation}
        className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0 disabled:opacity-50 disabled:pointer-events-none"
        title="New chat"
        aria-label={isCreatingConversation ? "Creating…" : "New chat"}
      >
        <Plus className="w-4 h-4" />
      </button>
      <ChatToolbar
        onConfigure={() => setIsConfigModalOpen(true)}
        onExport={handleExportChat}
        onSaveToNote={handleSaveToNote}
        onPin={handlePinActiveChat}
        isPinned={isPinned}
      />
    </div>
  );
};
