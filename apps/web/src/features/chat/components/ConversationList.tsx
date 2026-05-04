import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, Trash2, X, Check, Pin } from "lucide-react";
import type { Doc } from "@convex/_generated/dataModel";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { useToast } from "@/shared/contexts/useToast";

interface ConversationListProps {
  conversations: Doc<"conversations">[] | undefined;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pinnedIds?: Set<string>;
  onTogglePin?: (id: string) => void;
}

const sortByUpdated = (a: Doc<"conversations">, b: Doc<"conversations">) =>
  ((b.updatedAt as number | undefined) ?? 0) - ((a.updatedAt as number | undefined) ?? 0);

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-2.5 pb-1 font-sans text-xs font-medium text-muted-foreground select-none">
      {children}
    </div>
  );
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onRename,
  onDelete,
  pinnedIds,
  onTogglePin,
}: ConversationListProps) {
  /** Submenu is portaled to body; position stored so it is not clipped by parent overflow. */
  const [threadMenu, setThreadMenu] = useState<{
    convId: string;
    top: number;
    right: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const threadMenuBoxRef = useRef<HTMLDivElement>(null);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const toast = useToast();

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const { pinned, recents } = useMemo(() => {
    if (!conversations) {
      return { pinned: [] as Doc<"conversations">[], recents: [] as Doc<"conversations">[] };
    }
    const pin: Doc<"conversations">[] = [];
    const rest: Doc<"conversations">[] = [];
    for (const c of conversations) {
      if (pinnedIds?.has(c._id)) pin.push(c);
      else rest.push(c);
    }
    pin.sort(sortByUpdated);
    rest.sort(sortByUpdated);
    return { pinned: pin, recents: rest };
  }, [conversations, pinnedIds]);

  const threadMenuDoc = useMemo(() => {
    if (!conversations || !threadMenu) return null;
    return conversations.find((c) => c._id === threadMenu.convId) ?? null;
  }, [conversations, threadMenu]);

  useEffect(() => {
    if (!threadMenu) return;
    const onScroll = () => setThreadMenu(null);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [threadMenu]);

  useEffect(() => {
    if (!threadMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (threadMenuBoxRef.current?.contains(t)) return;
      if ((e.target as Element | null)?.closest?.("[data-thread-menu-trigger]")) return;
      setThreadMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [threadMenu]);

  const handleStartRename = (conv: Doc<"conversations">) => {
    setEditingId(conv._id);
    setEditTitle((conv.title as string | undefined) ?? "New Chat");
    setThreadMenu(null);
  };

  const handleFinishRename = async () => {
    if (!editingId || !editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await onRename(editingId, editTitle.trim());
    } catch {
      toast.error("Failed to rename thread");
    }
    setEditingId(null);
  };

  const handleDelete = async (conv: Doc<"conversations">) => {
    setThreadMenu(null);
    const ok = await confirm(
      "Delete thread?",
      "This will permanently delete this thread and all its messages.",
      { confirmText: "Delete", variant: "danger" }
    );
    if (!ok) return;
    try {
      await onDelete(conv._id);
    } catch {
      toast.error("Failed to delete thread");
    }
  };

  const renderRow = (conv: Doc<"conversations">) => {
    const isActive = conv._id === activeConversationId;
    const isEditing = conv._id === editingId;
    const isPinned = pinnedIds?.has(conv._id) ?? false;

    if (isEditing) {
      return (
        <div key={conv._id} className="px-1.5 py-0.5">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
            <input
              ref={editInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="min-w-0 flex-1 border-0 bg-transparent font-sans text-xs text-foreground outline-none"
            />
            <button
              type="button"
              onClick={handleFinishRename}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={conv._id}
        className={`group flex min-h-[38px] w-full max-w-full items-stretch overflow-hidden rounded-lg transition-colors duration-150 ${
          isActive ? "bg-muted/50 text-foreground" : "text-foreground/90 hover:bg-muted/45"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(conv._id)}
          className={`flex min-w-0 flex-1 items-center gap-2.5 pl-2.5 pr-1.5 text-left font-sans text-xs font-normal antialiased leading-snug transition-colors ${
            isActive ? "text-foreground/92" : "text-foreground/78"
          }`}
        >
          {isPinned ? (
            <Pin
              className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-muted-foreground" : "text-muted-foreground/80"}`}
              strokeWidth={1.75}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">
            {(conv.title as string | undefined) ?? "New chat"}
          </span>
        </button>
        <div className="flex shrink-0 items-center pr-0.5">
          <button
            type="button"
            data-thread-menu-trigger
            onClick={(e) => {
              e.stopPropagation();
              if (threadMenu?.convId === conv._id) {
                setThreadMenu(null);
                return;
              }
              const r = e.currentTarget.getBoundingClientRect();
              setThreadMenu({
                convId: conv._id,
                top: r.bottom + 4,
                right: document.documentElement.clientWidth - r.right,
              });
            }}
            className={`rounded-md p-1.5 text-muted-foreground transition-[opacity,background-color,color] hover:bg-foreground/5 hover:text-foreground ${
              isActive || threadMenu?.convId === conv._id
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="Thread options"
            aria-expanded={threadMenu?.convId === conv._id}
          >
            <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
  };

  if (!conversations) {
    return (
      <div className="px-3 py-6 text-center font-sans text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-6 text-center font-sans text-sm text-muted-foreground">
        No other threads
      </div>
    );
  }

  const threadMenuPinned = threadMenuDoc ? (pinnedIds?.has(threadMenuDoc._id) ?? false) : false;

  return (
    <>
      <div className="flex flex-col gap-1 pb-2 pt-1 font-sans antialiased">
        {pinned.length > 0 && (
          <>
            <SectionLabel>Pinned</SectionLabel>
            {pinned.map(renderRow)}
          </>
        )}
        {recents.length > 0 && (
          <>
            <SectionLabel>Recents</SectionLabel>
            {recents.map(renderRow)}
          </>
        )}
      </div>
      <ConfirmDialogComponent />
      {threadMenu &&
        threadMenuDoc &&
        createPortal(
          <div
            ref={threadMenuBoxRef}
            role="menu"
            data-thread-submenu-root
            className="fixed z-200 min-w-36 overflow-hidden rounded-lg border border-border bg-card py-1 font-sans text-sm antialiased shadow-lg"
            style={{ top: threadMenu.top, right: threadMenu.right }}
          >
            {onTogglePin && (
              <button
                type="button"
                onClick={() => {
                  onTogglePin(threadMenuDoc._id);
                  setThreadMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-sans hover:bg-muted/80"
                role="menuitem"
              >
                <Pin className="h-3.5 w-3.5" strokeWidth={1.75} />
                {threadMenuPinned ? "Unpin" : "Pin"}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleStartRename(threadMenuDoc)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-sans hover:bg-muted/80"
              role="menuitem"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Rename
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(threadMenuDoc)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-sans text-destructive hover:bg-muted/80"
              role="menuitem"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Delete
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
