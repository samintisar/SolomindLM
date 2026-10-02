import { FileText, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import React from "react";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";
import { ItemGroup } from "@/shared/components/ui/item";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Source } from "@/shared/types";
import { SourceListItem } from "./SourceListItem";

interface SourceListProps {
  sources: Source[];
  filteredSources: Source[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onToggleAll: () => void;
  onToggleSource: (id: string) => void;
  onViewSource: (id: string) => void;
  onDeleteSource: (id: string, title: string) => void;
  onRefreshSource: (id: string) => void;
  onRenameSource: (id: string, newTitle: string) => void;
  allSelected: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  openMenuId: string | null;
  onMenuOpenChange: (id: string, open: boolean) => void;
  onRenameCancel: () => void;
  onStartRename: (sourceId: string) => void;
  onAddSource: () => void;
  onDiscoverClick: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onRefreshAll: () => void;
  canRefreshAll: boolean;
  isRefreshing: boolean;
}

export const SourceList: React.FC<SourceListProps> = ({
  sources,
  filteredSources,
  searchQuery,
  onSearchChange,
  onToggleAll,
  onToggleSource,
  onViewSource,
  onDeleteSource,
  onRefreshSource,
  onRenameSource,
  allSelected,
  renamingId,
  renameValue,
  onRenameChange,
  openMenuId,
  onMenuOpenChange,
  onRenameCancel,
  onStartRename,
  onAddSource,
  onDiscoverClick,
  selectedCount,
  onDeleteSelected,
  onRefreshAll,
  canRefreshAll,
  isRefreshing,
}) => {
  const handleRenameSubmit = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      onRenameSource(id, newTitle.trim());
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {sources.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              onClick={onAddSource}
              title="Add Source"
              data-onboarding="add-source-button"
            >
              <Plus />
              Add source
            </Button>
            <ButtonGroup variant="tray" aria-label="Source actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Discover sources"
                    onClick={onDiscoverClick}
                  >
                    <Search />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Discover sources</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Refresh all"
                      onClick={onRefreshAll}
                      disabled={!canRefreshAll || isRefreshing}
                    >
                      {isRefreshing ? <Spinner /> : <RefreshCw />}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Re-fetch web pages and Google Drive imports</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete selected"
                      onClick={onDeleteSelected}
                      disabled={selectedCount === 0}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Delete selected</TooltipContent>
              </Tooltip>
            </ButtonGroup>
          </div>

          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search sources"
              placeholder="Search sources..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </InputGroup>
        </>
      )}

      {sources.length > 0 && (
        <div className="flex items-center justify-between font-sans text-xs text-muted-foreground">
          <span>
            {selectedCount} of {sources.length} selected
          </span>
          {filteredSources.length > 0 && (
            <Button variant="ghost" size="xs" onClick={onToggleAll}>
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          )}
        </div>
      )}

      {sources.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Add your first source</EmptyTitle>
            <EmptyDescription>
              Upload files, paste links or import papers to ground your notebook.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onAddSource} title="Add Source" data-onboarding="add-source-button">
              <Plus />
              Add source
            </Button>
          </EmptyContent>
        </Empty>
      ) : filteredSources.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No sources match your search.
        </p>
      ) : (
        <ItemGroup variant="grouped">
          {filteredSources.map((source) => (
            <SourceListItem
              key={source.id}
              source={source}
              isRenaming={renamingId === source.id}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={onRenameCancel}
              onToggle={onToggleSource}
              onView={onViewSource}
              onDelete={onDeleteSource}
              onMenuOpenChange={onMenuOpenChange}
              onStartRename={onStartRename}
              isMenuOpen={openMenuId === source.id}
              onRefreshSource={onRefreshSource}
            />
          ))}
        </ItemGroup>
      )}
    </div>
  );
};
