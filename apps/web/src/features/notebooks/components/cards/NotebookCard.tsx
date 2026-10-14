import { EyeOff, FolderOpen, Globe, Settings2, Star, Trash2, Users } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import { notebookIcon } from "@/shared/notebook/notebookIcons";
import type { NotebookItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { cn } from "@/shared/utils/cn";
import { notebookMeta } from "../../notebookMeta";
import { type CardAction, CardActionsMenu } from "./CardActionsMenu";
import { CARD_OPEN_BUTTON_CLASS } from "./cardClasses";

interface NotebookCardProps {
  notebook: NotebookItem;
  viewMode: "grid" | "list";
  onSelectNotebook: (notebook: NotebookItem) => void;
  onOpenCustomize?: () => void;
  onOpenMoveToFolder?: () => void;
  onDeleteNotebook?: (id: string) => void;
  /** "public": shown on the Public tab — author line, no owner actions. */
  variant?: "default" | "public";
  /** Admin moderation on Public-tab cards. */
  adminActions?: { onToggleFeatured: () => void; onUnpublish: () => void };
}

function useNotebookActions({
  notebook,
  onOpenCustomize,
  onOpenMoveToFolder,
  onDeleteNotebook,
  adminActions,
}: NotebookCardProps) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const moderation: CardAction[] = [];
  if (adminActions)
    moderation.push(
      {
        label: notebook.isFeatured ? "Unfeature" : "Feature",
        icon: Star,
        onSelect: adminActions.onToggleFeatured,
      },
      {
        label: "Unpublish",
        icon: EyeOff,
        destructive: true,
        onSelect: async () => {
          const ok = await confirm(
            "Unpublish notebook",
            `Remove "${notebook.title}" from the Public tab? The owner can publish it again.`,
            { confirmText: "Unpublish", cancelText: "Cancel", variant: "danger" }
          );
          if (ok) adminActions.onUnpublish();
        },
      }
    );

  const actions: CardAction[] = [];
  if (onOpenCustomize)
    actions.push({ label: "Customize", icon: Settings2, onSelect: onOpenCustomize });
  if (onOpenMoveToFolder)
    actions.push({ label: "Move to folder", icon: FolderOpen, onSelect: onOpenMoveToFolder });
  if (onDeleteNotebook)
    actions.push({
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onSelect: async () => {
        const ok = await confirm(
          "Delete Notebook",
          `Are you sure you want to delete "${notebook.title}"? This action cannot be undone.`,
          { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
        );
        if (ok) onDeleteNotebook(notebook.id);
      },
    });
  return { actions, moderation, ConfirmDialogComponent };
}

function StatusBadge({ props }: { props: NotebookCardProps }) {
  const { notebook } = props;
  if (props.variant === "public" && notebook.isFeatured)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Star aria-hidden />
        Featured
      </Badge>
    );
  if (notebook.isSharedNotebook)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Users aria-hidden />
        Shared
      </Badge>
    );
  if (props.variant !== "public" && notebook.isPublic)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Globe aria-hidden />
        Public
      </Badge>
    );
  return null;
}

/** The card's menu: admin moderation, else the owner's actions, else none. */
function cardMenu(
  props: NotebookCardProps,
  actions: CardAction[],
  moderation: CardAction[]
): { label: string; actions: CardAction[] } | null {
  if (moderation.length > 0) return { label: "Moderation actions", actions: moderation };
  if (props.variant === "public" || props.notebook.isSharedNotebook || actions.length === 0)
    return null;
  return { label: "Notebook actions", actions };
}

export function NotebookCard(props: NotebookCardProps) {
  const { notebook, viewMode, onSelectNotebook } = props;
  const { actions: ownerActions, moderation, ConfirmDialogComponent } = useNotebookActions(props);
  const actions = props.variant === "public" ? [] : ownerActions;
  const menu = cardMenu(props, actions, moderation);
  const Icon = notebookIcon(notebook.icon);
  const fill = coverFillClass(notebook.coverColor);
  // Public cards: author and created date; public listings don't count sources.
  const meta =
    props.variant === "public"
      ? [
          notebook.ownerName && `by ${notebook.ownerName}`,
          notebookMeta({ created_at: notebook.created_at }),
        ]
          .filter(Boolean)
          .join(" · ")
      : notebookMeta(notebook);
  const open = () => onSelectNotebook(notebook);

  if (viewMode === "list") {
    return (
      <>
        <Card variant="interactive" className="flex-row items-center">
          <button
            type="button"
            onClick={open}
            className={cn(
              CARD_OPEN_BUTTON_CLASS,
              "flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
            )}
          >
            <span
              className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", fill)}
            >
              <Icon aria-hidden className={cn("size-4", COVER_ICON_CLASS)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-card-foreground">
                  {notebook.title}
                </span>
                <StatusBadge props={props} />
              </span>
              <span className="block truncate text-xs text-muted-foreground sm:hidden">{meta}</span>
            </span>
            <span className="hidden w-40 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {meta}
            </span>
          </button>
          <div className="mr-2 flex w-8 shrink-0 justify-center">
            {menu && <CardActionsMenu label={menu.label} actions={menu.actions} />}
          </div>
        </Card>
        <ConfirmDialogComponent />
      </>
    );
  }

  return (
    <>
      <Card variant="interactive" className="h-full">
        <button
          type="button"
          onClick={open}
          className={cn(CARD_OPEN_BUTTON_CLASS, "flex h-full flex-col text-left")}
        >
          <span className={cn("flex h-16 w-full items-end p-3 sm:h-24 sm:p-4", fill)}>
            <Icon aria-hidden className={cn("size-6 sm:size-8", COVER_ICON_CLASS)} />
          </span>
          <span className="flex flex-1 flex-col gap-1 p-3 sm:gap-1.5 sm:p-4">
            <span className="line-clamp-2 text-base font-semibold leading-snug text-card-foreground">
              {notebook.title}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {meta}
              {/* The corner holds the menu, so the status badge sits beside the meta instead. */}
              {menu && <StatusBadge props={props} />}
            </span>
          </span>
        </button>
        <div className="absolute top-2 right-2">
          {menu ? (
            <CardActionsMenu label={menu.label} actions={menu.actions} />
          ) : (
            <StatusBadge props={props} />
          )}
        </div>
      </Card>
      <ConfirmDialogComponent />
    </>
  );
}
