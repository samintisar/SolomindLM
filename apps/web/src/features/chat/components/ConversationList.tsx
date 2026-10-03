import type { Doc } from "@convex/_generated/dataModel";
import { Check, MoreVertical, Pencil, Pin, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { useToast } from "@/shared/contexts/useToast";
import { cn } from "@/shared/utils/cn";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  /** Row whose action menu is open: its trigger stays visible while the pointer is over the menu. */
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  /** Set once a rename is saved or cancelled so the blur that follows (Enter, Escape, unmount) is a no-op. */
  const renameSettledRef = useRef(false);
  /** Thread awaiting delete confirmation. */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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

  const handleStartRename = (conv: Doc<"conversations">) => {
    renameSettledRef.current = false;
    setEditingId(conv._id);
    setEditTitle((conv.title as string | undefined) ?? "New Chat");
  };

  const handleCancelRename = () => {
    renameSettledRef.current = true;
    setEditingId(null);
  };

  const handleFinishRename = async () => {
    if (renameSettledRef.current) return;
    renameSettledRef.current = true;
    const id = editingId;
    // Only close the editor this save belongs to: a slow save on one thread must not close another thread's editor.
    const closeIfStillEditing = () => setEditingId((cur) => (cur === id ? null : cur));
    if (!id || !editTitle.trim()) {
      closeIfStillEditing();
      return;
    }
    try {
      await onRename(id, editTitle.trim());
    } catch {
      toast.error("Failed to rename thread");
    }
    closeIfStillEditing();
  };

  const handleConfirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    try {
      await onDelete(id);
    } catch {
      toast.error("Failed to delete thread");
    }
  };

  const renderRow = (conv: Doc<"conversations">) => {
    const isActive = conv._id === activeConversationId;
    const isEditing = conv._id === editingId;
    const isPinned = pinnedIds?.has(conv._id) ?? false;
    const title = (conv.title as string | undefined) ?? "New chat";

    if (isEditing) {
      return (
        <div key={conv._id} className="flex items-center gap-1 px-1.5 py-0.5">
          <Input
            ref={editInputRef}
            aria-label="Rename thread"
            data-rename-input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleFinishRename();
              // A hosting Popover/Dialog listens for Escape on the document (capture), which this handler cannot
              // stop: the host must ignore Escape coming from `[data-rename-input]`.
              if (e.key === "Escape") handleCancelRename();
            }}
            onBlur={(e) => {
              // Tabbing to Save/Cancel must not save first: those buttons decide.
              if ((e.relatedTarget as HTMLElement | null)?.closest("[data-rename-actions]")) return;
              void handleFinishRename();
            }}
            className="h-8 flex-1"
          />
          {/* Default mousedown is prevented so the input keeps focus; otherwise its blur-save would beat these clicks. */}
          <div data-rename-actions className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Save name"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleFinishRename()}
            >
              <Check />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel rename"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCancelRename}
            >
              <X />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={conv._id}
        className={cn(
          "group flex min-h-10 w-full max-w-full items-center rounded-lg pr-1 transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent"
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(conv._id)}
          aria-current={isActive ? "true" : undefined}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 pl-2.5 pr-1.5 text-left font-sans text-xs leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isPinned ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0 flex-1 truncate">{title}</span>
        </button>
        <DropdownMenu
          modal={false}
          open={openMenuId === conv._id}
          onOpenChange={(open) => setOpenMenuId(open ? conv._id : null)}
        >
          <div
            className={cn(
              "shrink-0 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
              // Hidden: not tappable either (touch laptops have a fine pointer and no hover).
              isActive || openMenuId === conv._id ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Thread actions for ${title}`}
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="end">
            {onTogglePin && (
              <DropdownMenuItem onSelect={() => onTogglePin(conv._id)}>
                <Pin />
                {isPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => handleStartRename(conv)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setPendingDeleteId(conv._id)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      {/* A nested Radix layer: inside a host Popover/Dialog, Escape and outside clicks close only this alert, and
          its pointer events count as inside the host. The host must not unmount the list while it is open. */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this thread and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleConfirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
