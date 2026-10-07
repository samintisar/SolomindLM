import type { Id } from "@convex/_generated/dataModel";
import { LiteraturePapersPanel } from "@/features/studio/components/LiteraturePapersPanel";
import { LiteratureScreeningPanel } from "@/features/studio/components/LiteratureScreeningPanel";
import { LiteratureStudioView } from "@/features/studio/components/LiteratureStudioView";
import { StudioPanel } from "@/features/studio/components/StudioPanel";
import type { ActiveLiteratureView } from "@/features/studio/types/literatureStudio";
import { STUDIO_TOOLS } from "@/shared/constants";
import type { Source } from "@/shared/types/index";

interface NotebookRightPanelProps {
  notebookId: string;
  sources: Source[];
  activeLiteratureView: ActiveLiteratureView | null;
  onCloseLiteratureView: () => void;
  onOpenSavedReport: (reportId: Id<"reports">) => void;
  onOpenSavedSpreadsheet: (spreadsheetId: Id<"spreadsheets">) => void;
  onCloseStudio: () => void;
  onAskInChat: (prompt: string, documentIds?: string[]) => void;
}

/** The notebook's right column (desktop panel and mobile Studio tab): an open literature view, else Studio. */
export function NotebookRightPanel({
  notebookId,
  sources,
  activeLiteratureView,
  onCloseLiteratureView,
  onOpenSavedReport,
  onOpenSavedSpreadsheet,
  onCloseStudio,
  onAskInChat,
}: NotebookRightPanelProps) {
  switch (activeLiteratureView?.kind) {
    case "papers":
      return (
        <LiteraturePapersPanel
          sessionId={activeLiteratureView.sessionId}
          notebookId={notebookId as Id<"notebooks">}
          onClose={onCloseLiteratureView}
        />
      );
    case "screening":
      return (
        <LiteratureScreeningPanel
          sessionId={activeLiteratureView.sessionId}
          onClose={onCloseLiteratureView}
        />
      );
    case "table":
    case "report":
      return (
        <LiteratureStudioView
          view={activeLiteratureView}
          notebookId={notebookId as Id<"notebooks">}
          onClose={onCloseLiteratureView}
          onOpenSavedReport={onOpenSavedReport}
          onOpenSavedSpreadsheet={onOpenSavedSpreadsheet}
        />
      );
    default:
      return (
        <StudioPanel
          isOpen={true}
          onClose={onCloseStudio}
          tools={STUDIO_TOOLS}
          sources={sources}
          notebookId={notebookId}
          onAskInChat={onAskInChat}
        />
      );
  }
}
