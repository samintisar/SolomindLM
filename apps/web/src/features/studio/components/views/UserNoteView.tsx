import React, { lazy, Suspense } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { UserNote } from '@/shared/types/index';
import { sanitizeMarkdown } from '@/shared/utils';

const MarkdownRenderer = lazy(() =>
  import('@/shared/components/MarkdownRenderer').then((m) => ({ default: m.default }))
);

export interface UserNoteViewProps {
  note: UserNote;
  onBack?: () => void;
}

export const UserNoteView: React.FC<UserNoteViewProps> = ({ note, onBack }) => {
  return (
    <div className={`flex flex-col h-full bg-background ${onBack ? 'md:pt-0 pt-16' : ''}`}>
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden absolute top-0 left-0 right-0 flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {note.content ? (
            <Suspense fallback={<div className="prose prose-sm dark:prose-invert max-w-none">Loading...</div>}>
              <MarkdownRenderer
                className="prose prose-sm dark:prose-invert max-w-none
                  prose-headings:font-semibold prose-headings:text-foreground
                  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:font-semibold
                  prose-h2:text-foreground
                  prose-p:text-sm prose-p:text-foreground prose-p:leading-relaxed
                  prose-ul:text-sm prose-ol:text-sm
                  prose-li:text-foreground
                  prose-strong:text-foreground
                  prose-em:text-muted-foreground
                  prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                  prose-pre:bg-muted prose-pre:border prose-pre:border-border
                  prose-blockquote:border-l-border prose-blockquote:text-muted-foreground
                  prose-hr:border-border
                  [&_strong]:font-semibold
                  [&_em]:italic"
              >
                {sanitizeMarkdown(note.content)}
              </MarkdownRenderer>
            </Suspense>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
              <FileText className="w-12 h-12 text-muted-foreground/50" />
              <p className="text-muted-foreground font-serif italic">Empty note</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
