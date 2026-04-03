import React from 'react';
import {
  FileText, Globe, File, CheckSquare, Square, Loader2, XCircle, MoreVertical, Edit2, Trash2, RefreshCw,
} from 'lucide-react';
import { Source } from '@/shared/types';

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
  const status = source.status || 'completed';
  const canClick = !isRenaming && status !== 'processing';

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && renameValue.trim()) {
      onRenameSubmit(source.id, renameValue.trim());
    } else if (e.key === 'Escape') {
      onRenameCancel();
    }
  };

  const getIcon = () => {
    if (source.type === 'WEB') return <Globe className="w-5 h-5" />;
    if (source.type === 'IMG') return <File className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  return (
    <div
      className={`group flex flex-col bg-card border border-border rounded-lg hover:shadow-md transition-all cursor-pointer overflow-visible relative ${isMenuOpen ? 'z-[200]' : ''}`}
      onClick={() => canClick && onView(source.id)}
    >
      <div className="flex items-center gap-2 py-2.5 px-2.5">
        <div className="text-muted-foreground shrink-0 flex items-center justify-center">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isRenaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-2 py-1 text-sm bg-background border border-primary rounded font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            ) : (
              <h4 className="text-sm font-medium text-foreground truncate leading-tight">
                {source.title}
              </h4>
            )}
            {/* Status badge */}
            {status === 'processing' && (
              <div className="flex items-center gap-1 text-xs font-medium text-warning font-sans shrink-0">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span>Processing</span>
              </div>
            )}
            {status === 'failed' && (
              <div className="flex items-center gap-1 text-xs font-medium text-destructive font-sans shrink-0">
                <XCircle className="w-3 h-3 shrink-0" />
                <span>Failed</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-sans">
            {source.type} • {source.date}
          </p>
        </div>
        {!isRenaming && (
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="text-primary p-1 hover:bg-secondary rounded-xl transition-colors flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(source.id);
              }}
            >
              {source.selected ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4 opacity-50 group-hover:opacity-100" />
              )}
            </div>
            <div className="relative z-50">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuOpen(source.id);
                }}
                className={`p-1 hover:bg-secondary rounded-xl transition-colors flex items-center justify-center ${
                  isMenuOpen ? 'text-foreground bg-secondary' : 'text-muted-foreground'
                }`}
                title="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[100]"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onMenuOpen('');
                    }}
                  />
                  <div className="absolute right-0 top-full mt-1 z-[110] min-w-[140px] rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                    {source.remoteRefreshKind && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRefreshSource(source.id);
                          onMenuOpen('');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary border-b border-border transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartRename(source.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary border-b border-border transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(source.id, source.title);
                        onMenuOpen('');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
