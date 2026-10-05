import { ArrowLeft, FileText, XCircle } from "lucide-react";
import React, { lazy, Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ReportNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

export interface ReportViewProps {
  note: ReportNote;
  onBack?: () => void;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    return (error as { message?: string }).message || "An unknown error occurred";
  }
  return typeof error === "string" && error ? error : "An unknown error occurred";
}

/** Generated reports must not link out or embed media, so those render as nothing or plain text. */
const reportComponents = {
  img: () => null,
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
};

export const ReportView: React.FC<ReportViewProps> = ({ note, onBack }) => {
  const isFailed = note.status === "failed";

  return (
    <div className="flex h-full flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300 ease-out">
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/80 px-2 py-2 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold">{note.title}</span>
        </div>
      )}

      {isFailed && (
        <div className="px-4 pt-4">
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Report generation failed</AlertTitle>
            <AlertDescription>{errorMessage(note.metadata?.error)}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex-1 bg-card p-6 md:p-8">
        {note.content ? (
          <div className="animate-in fade-in duration-300 ease-out">
            <Suspense
              fallback={
                <div className="mx-auto max-w-prose space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              }
            >
              <MarkdownRenderer
                className="prose mx-auto font-serif select-text"
                components={reportComponents}
              >
                {sanitizeMarkdown(note.content)}
              </MarkdownRenderer>
            </Suspense>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">{isFailed ? <XCircle /> : <FileText />}</EmptyMedia>
              <EmptyTitle>
                {isFailed ? "Report generation failed" : "No content available"}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
};
