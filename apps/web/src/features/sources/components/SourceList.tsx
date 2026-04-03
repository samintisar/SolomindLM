import React from 'react';
import { Search, Plus, FileStack, Trash2, RefreshCw } from 'lucide-react';
import { Source } from '@/shared/types';
import { SourceListItem } from './SourceListItem';

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
  onMenuOpen: (id: string) => void;
  onStartRename: (sourceId: string) => void;
  width: number;
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
  onMenuOpen,
  onStartRename,
  width,
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

  const handleRenameCancel = () => {
    onMenuOpen('');
  };

  /** Below 300px: icon-only. 300–399px: single-line abbreviations so labels never wrap. */
  const actionIconsOnly = width < 300;
  const actionAbbrevLabels = width >= 300 && width < 400;
  const showActionLabels = width >= 300;

  return (
    <div className="p-3 space-y-4">
      {/* Action Bar */}
      <div className="flex flex-col gap-2 p-1.5 bg-background/50 border border-border rounded-lg shadow-inner">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddSource}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 transition-all font-display font-bold text-[13px] uppercase tracking-wider min-w-0 ${actionIconsOnly ? 'px-3' : ''}`}
            title={actionIconsOnly || actionAbbrevLabels ? 'Add Source' : ''}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {showActionLabels && (
              <span className="min-w-0 whitespace-nowrap truncate">{actionAbbrevLabels ? 'ADD…' : 'Add Source'}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onDiscoverClick}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-card border border-border text-foreground rounded-md shadow-xs hover:bg-secondary hover:border-primary/30 transition-all font-display font-bold text-[13px] uppercase tracking-wider min-w-0 ${actionIconsOnly ? 'px-3' : ''}`}
            title={actionIconsOnly || actionAbbrevLabels ? 'Discover sources' : ''}
          >
            <Search className="w-4 h-4 text-primary shrink-0" />
            {showActionLabels && (
              <span className="min-w-0 whitespace-nowrap truncate">{actionAbbrevLabels ? 'DISC…' : 'Discover'}</span>
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-card/80 border border-border/70 text-destructive/90 rounded-md shadow-none hover:bg-destructive/10 hover:border-border hover:text-destructive transition-all font-display font-medium text-[13px] uppercase tracking-wide disabled:opacity-40 disabled:pointer-events-none min-w-0 ${actionIconsOnly ? 'px-2' : ''}`}
            title={actionIconsOnly || actionAbbrevLabels ? 'Delete selected' : ''}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            {showActionLabels && (
              <span className="min-w-0 whitespace-nowrap truncate">{actionAbbrevLabels ? 'DEL…' : 'Delete'}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={!canRefreshAll || isRefreshing}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-card/80 border border-border/70 text-muted-foreground rounded-md shadow-none hover:bg-secondary/80 hover:border-border hover:text-foreground transition-all font-display font-medium text-[13px] uppercase tracking-wide disabled:opacity-40 disabled:pointer-events-none min-w-0 ${actionIconsOnly ? 'px-2' : ''}`}
            title="Re-fetch web pages and Google Drive imports"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
            {showActionLabels && (
              <span className="min-w-0 whitespace-nowrap truncate">{actionAbbrevLabels ? 'REFRESH…' : 'Refresh all'}</span>
            )}
          </button>
        </div>
      </div>

      {/* Search & List */}
      <div className="space-y-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search sources..."
            className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-serif shadow-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-1 font-display">
            <span>
              {filteredSources.length} {searchQuery.trim() ? `of ${sources.length}` : ''} items
            </span>
            {sources.length > 0 && filteredSources.length > 0 && (
              <button
                type="button"
                onClick={onToggleAll}
                className="hover:text-primary transition-colors cursor-pointer select-none font-medium"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {filteredSources.length === 0 ? (
            <div className="text-center py-12">
              <FileStack className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">
                {searchQuery.trim() ? 'No sources match your search.' : 'No sources yet. Add your first source to get started.'}
              </p>
            </div>
          ) : (
            filteredSources.map((source) => (
              <SourceListItem
                key={source.id}
                source={source}
                isRenaming={renamingId === source.id}
                renameValue={renameValue}
                onRenameChange={onRenameChange}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
                onToggle={onToggleSource}
                onView={onViewSource}
                onDelete={onDeleteSource}
                onMenuOpen={onMenuOpen}
                onStartRename={onStartRename}
                isMenuOpen={openMenuId === source.id}
                onRefreshSource={onRefreshSource}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
