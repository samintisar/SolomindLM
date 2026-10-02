import {
  File,
  FileText,
  Globe,
  GraduationCap,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  Youtube,
} from "lucide-react";
import React from "react";
import { Favicon } from "@/shared/components/Favicon";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/shared/components/ui/item";
import { Spinner } from "@/shared/components/ui/spinner";
import { Source } from "@/shared/types";

interface SourceListItemProps {
  source: Source;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: (id: string, newTitle: string) => void;
  onRenameCancel: () => void;
  onToggle: (id: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onRefreshSource: (id: string) => void;
  onMenuOpen: (id: string) => void;
  onStartRename: (sourceId: string) => void;
  isMenuOpen: boolean;
}

export const SourceListItem: React.FC<SourceListItemProps> = ({
  source,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onToggle,
  onView,
  onDelete,
  onRefreshSource,
  onMenuOpen,
  onStartRename,
  isMenuOpen,
}) => {
  const status = source.status || "completed";
  const canRemoteRefresh = Boolean(source.remoteRefreshKind);

  // Enter/Escape already settle the rename; the blur that follows the input
  // unmounting must not submit it a second time (or submit after Escape).
  const renameSettledRef = React.useRef(false);
  React.useEffect(() => {
    if (isRenaming) renameSettledRef.current = false;
  }, [isRenaming]);

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && renameValue.trim()) {
      renameSettledRef.current = true;
      onRenameSubmit(source.id, renameValue.trim());
    } else if (e.key === "Escape") {
      renameSettledRef.current = true;
      onRenameCancel();
    }
  };

  const handleRenameBlur = () => {
    if (renameSettledRef.current) return;
    renameSettledRef.current = true;
    if (renameValue.trim()) onRenameSubmit(source.id, renameValue.trim());
    else onRenameCancel();
  };

  const getIcon = () => {
    if (source.type === "YOUTUBE") {
      return <Youtube className="size-5 text-destructive" aria-hidden />;
    }
    if (source.type === "WEB") {
      return (
        <Favicon
          url={source.url}
          size={20}
          className="rounded-sm"
          fallback={<Globe className="size-5" />}
        />
      );
    }
    if (source.type === "PAPER") return <GraduationCap className="size-5" />;
    if (source.type === "IMG") return <File className="size-5" />;
    return <FileText className="size-5" />;
  };

  /** Short subtitle for papers — sentence case, no badge (see meta row below title). */
  const paperMetaHint = (): string | null => {
    if (source.type !== "PAPER" || !source.paper) return null;
    if (status === "processing" || source.paper.ingestionStatus === "pending") return null;
    if (status === "failed" || source.paper.ingestionStatus === "failed") return null;
    if (source.paper.ingestionStatus === "metadata_only") {
      return source.paper.fulltextStatus === "external_only" ? "External" : "Abstract";
    }
    if (source.paper.ingestionStatus === "ingested") {
      return source.paper.fulltextStatus === "available" ? "Full text" : "Indexed";
    }
    return null;
  };

  const paperHint = paperMetaHint();

  return (
    <Item data-source-id={source.id} size="sm">
      {isRenaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ItemMedia variant="icon">{getIcon()}</ItemMedia>
          <Input
            autoFocus
            aria-label="Rename source"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameBlur}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onView(source.id)}
          disabled={status === "processing"}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left outline-hidden hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <ItemMedia variant="icon">{getIcon()}</ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full">
              <span className="truncate">{source.title}</span>
              {status === "processing" && (
                <Badge variant="secondary">
                  <Spinner aria-hidden />
                  Processing
                </Badge>
              )}
              {status === "failed" && <Badge variant="destructive">Failed</Badge>}
            </ItemTitle>
            <ItemDescription>
              <span className="block truncate font-sans text-xs">
                <span
                  className={
                    source.type === "YOUTUBE" ? "tracking-wide" : "uppercase tracking-wide"
                  }
                >
                  {source.type === "YOUTUBE" ? "YouTube" : source.type}
                </span>
                <span> • {source.date}</span>
                {paperHint && status === "completed" && (
                  <span className="font-normal normal-case tracking-normal"> · {paperHint}</span>
                )}
              </span>
            </ItemDescription>
          </ItemContent>
        </button>
      )}
      <ItemActions>
        <Checkbox
          checked={source.selected}
          onCheckedChange={() => onToggle(source.id)}
          aria-label={`Include ${source.title} in chat`}
        />
        <DropdownMenu
          modal={false}
          open={isMenuOpen}
          onOpenChange={(open) => {
            if (open !== isMenuOpen) onMenuOpen(source.id);
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="More options"
              title="More options"
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canRemoteRefresh && (
              <DropdownMenuItem onSelect={() => onRefreshSource(source.id)}>
                <RefreshCw />
                Refresh
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onStartRename(source.id)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(source.id, source.title)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
};
