import { FolderOpen, Settings2, Trash2, Users } from "lucide-react";
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
  /** Featured/demo notebooks: "Featured" badge, no actions. */
  featured?: boolean;
}

function useNotebookActions({
  notebook,
  onOpenCustomize,
  onOpenMoveToFolder,
  onDeleteNotebook,
}: NotebookCardProps) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
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
  return { actions, ConfirmDialogComponent };
}

function StatusBadge({ props }: { props: NotebookCardProps }) {
  if (props.featured)
    return (
      <Badge variant="secondary" className="shrink-0">
        Featured
      </Badge>
    );
  if (props.notebook.isSharedNotebook)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Users aria-hidden />
        Shared
      </Badge>
    );
  return null;
}

/** Grid corner: a status badge, or the actions menu when the card has actions. */
function CornerSlot({ props, actions }: { props: NotebookCardProps; actions: CardAction[] }) {
  if (props.featured || props.notebook.isSharedNotebook) return <StatusBadge props={props} />;
  if (actions.length === 0) return null;
  return <CardActionsMenu label="Notebook actions" actions={actions} />;
}

export function NotebookCard(props: NotebookCardProps) {
  const { notebook, viewMode, onSelectNotebook } = props;
  const { actions, ConfirmDialogComponent } = useNotebookActions(props);
  const Icon = notebookIcon(notebook.icon);
  const fill = coverFillClass(notebook.coverColor);
  const meta = notebookMeta(notebook);
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
            {actions.length > 0 && !props.featured && !notebook.isSharedNotebook && (
              <CardActionsMenu label="Notebook actions" actions={actions} />
            )}
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
            <span className="text-xs text-muted-foreground">{meta}</span>
          </span>
        </button>
        <div className="absolute top-2 right-2">
          <CornerSlot props={props} actions={actions} />
        </div>
      </Card>
      <ConfirmDialogComponent />
    </>
  );
}
