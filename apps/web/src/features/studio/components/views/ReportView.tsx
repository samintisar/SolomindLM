import { FileText, XCircle } from "lucide-react";
import type React from "react";
import { LazyMarkdown } from "@/shared/components/LazyMarkdown";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/components/ui/empty";
import { ReportNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";
import { studioErrorMessage } from "../../utils/studioErrorMessage";

export interface ReportViewProps {
  note: ReportNote;
}

export const ReportView: React.FC<ReportViewProps> = ({ note }) => {
  const isFailed = note.status === "failed";

  return (
    <div className="flex h-full flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300 ease-out">
      {isFailed && (
        <div className="px-4 pt-4">
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Report generation failed</AlertTitle>
            <AlertDescription>{studioErrorMessage(note.metadata?.error)}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Scrolls itself: the panel stops scrolling while the audio mini player is docked. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-card p-6 md:p-8">
        {note.content ? (
          <div className="animate-in fade-in duration-300 ease-out">
            <LazyMarkdown className="prose mx-auto font-serif select-text" generated>
              {sanitizeMarkdown(note.content)}
            </LazyMarkdown>
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
