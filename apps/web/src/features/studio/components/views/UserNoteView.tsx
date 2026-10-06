import { ArrowLeft, FileText } from "lucide-react";
import React, { lazy, Suspense } from "react";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { UserNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

export interface UserNoteViewProps {
  note: UserNote;
  onBack?: () => void;
}

export const UserNoteView: React.FC<UserNoteViewProps> = ({ note, onBack }) => {
  return (
    <div className="flex h-full flex-col bg-background">
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/80 px-2 py-2 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold">{note.title}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {note.content ? (
          <div className="px-6 py-6 animate-in fade-in duration-300 ease-out">
            <Suspense
              fallback={
                <div className="mx-auto max-w-prose space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              }
            >
              <MarkdownRenderer className="prose mx-auto font-serif select-text">
                {sanitizeMarkdown(note.content)}
              </MarkdownRenderer>
            </Suspense>
          </div>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>Empty note</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
};
