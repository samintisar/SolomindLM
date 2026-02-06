import React from 'react';
import { Search, Plus, FileStack } from 'lucide-react';
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
  onRenameSource: (id: string, newTitle: string) => void;
  onSetSourceType: (id: string, extension: 'md' | 'pdf' | 'txt') => void;
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
  onRenameSource,
  onSetSourceType,
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
}) => {
  const handleRenameSubmit = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      onRenameSource(id, newTitle.trim());
    }
  };

  const handleRenameCancel = () => {
    onMenuOpen('');
  };

  return (
    <div className="p-4 space-y-5">
      {/* Action Bar */}
      <div className="flex gap-2 p-1.5 bg-background/50 border border-border rounded-lg shadow-inner">
        <button
          onClick={onAddSource}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 transition-all font-sans font-bold text-[11px] uppercase tracking-wider ${width < 300 ? 'px-3' : ''}`}
          title={width < 300 ? 'Add Source' : ''}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {width >= 300 && <span>Add Source</span>}
        </button>
        <button
          onClick={onDiscoverClick}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-card border border-border text-foreground rounded-md shadow-xs hover:bg-secondary hover:border-primary/30 transition-all font-sans font-bold text-[11px] uppercase tracking-wider ${width < 300 ? 'px-3' : ''}`}
          title={width < 300 ? 'Discover' : ''}
        >
          <Search className="w-4 h-4 text-primary shrink-0" />
          {width >= 300 && <span>Discover</span>}
        </button>
      </div>

      {/* Search & List */}
      <div className="space-y-3">
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-1 font-sans">
            <span>
              {filteredSources.length} {searchQuery.trim() ? `of ${sources.length}` : ''} items
            </span>
            {sources.length > 0 && (
              <button
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
                onSetSourceType={onSetSourceType}
                onMenuOpen={onMenuOpen}
                onStartRename={onStartRename}
                isMenuOpen={openMenuId === source.id}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
