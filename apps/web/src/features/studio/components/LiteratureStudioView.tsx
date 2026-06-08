import type { Id } from "@convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useToast } from "@/shared/contexts/useToast";
import {
  useLiteratureReportDetail,
  useLiteratureTable,
  useSaveLiteratureReportAsStudioReport,
  useSaveLiteratureTableAsStudioSpreadsheet,
} from "../services/literatureTablesApi";
import type { ActiveLiteratureView } from "../types/literatureStudio";
import { literatureReportToolbarLabel } from "../utils/literatureReportLabels";
import type { CitationStyle } from "./CitationStylePicker";
import { ResizeHandle } from "./ResizeHandle";
import { LiteratureReportView } from "./views/LiteratureReportView";
import type { LiteratureTable } from "./views/LiteratureTableView";
import { LiteratureTableView } from "./views/LiteratureTableView";

interface LiteratureStudioViewProps {
  view: Exclude<ActiveLiteratureView, { kind: "papers" } | { kind: "screening" }>;
  width: number;
  notebookId: Id<"notebooks">;
  onClose: () => void;
  onOpenSavedReport?: (reportId: Id<"reports">) => void;
  onOpenSavedSpreadsheet?: (spreadsheetId: Id<"spreadsheets">) => void;
}

export const LiteratureStudioView: React.FC<LiteratureStudioViewProps> = ({
  view,
  width,
  notebookId,
  onClose,
  onOpenSavedReport,
  onOpenSavedSpreadsheet,
}) => {
  if (view.kind === "table") {
    return (
      <LiteratureTableStudioShell
        tableId={view.tableId}
        notebookId={notebookId}
        width={width}
        onClose={onClose}
        onOpenSavedSpreadsheet={onOpenSavedSpreadsheet}
      />
    );
  }

  return (
    <LiteratureReportStudioShell
      reportId={view.reportId}
      width={width}
      onClose={onClose}
      onOpenSavedReport={onOpenSavedReport}
    />
  );
};

function LiteratureTableStudioShell({
  tableId,
  notebookId,
  width,
  onClose,
  onOpenSavedSpreadsheet,
}: {
  tableId: Id<"literatureTables">;
  notebookId: Id<"notebooks">;
  width: number;
  onClose: () => void;
  onOpenSavedSpreadsheet?: (spreadsheetId: Id<"spreadsheets">) => void;
}) {
  const table = useLiteratureTable(tableId);
  const saveAsStudioSpreadsheet = useSaveLiteratureTableAsStudioSpreadsheet();
  const { success: toastSuccess, error: toastError } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(
    async (nextTable: LiteratureTable) => {
      setIsSaving(true);
      try {
        const spreadsheetId = await saveAsStudioSpreadsheet({
          tableId,
          title: nextTable.title,
          columns: nextTable.columns,
          papers: nextTable.papers.map((paper) => ({
            citationId: paper.citationId as Id<"citations">,
            rowData: paper.rowData,
            includeReason: paper.includeReason,
            isIncluded: paper.isIncluded,
          })),
        });
        toastSuccess("Table saved to Studio");
        onOpenSavedSpreadsheet?.(spreadsheetId);
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to save table");
      } finally {
        setIsSaving(false);
      }
    },
    [onOpenSavedSpreadsheet, saveAsStudioSpreadsheet, tableId, toastError, toastSuccess]
  );

  return (
    <PanelShell width={width} variant="table">
      {!table ? (
        <LoadingState />
      ) : (
        <LiteratureTableView
          table={{
            title: table.title,
            columns: table.columns,
            papers: table.papers.map((p: (typeof table.papers)[number]) => ({
              citationId: p.citationId,
              rowData: p.rowData,
              includeReason: p.includeReason,
              isIncluded: p.isIncluded,
              citation: p.citation,
            })),
          }}
          notebookId={notebookId}
          onBack={onClose}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </PanelShell>
  );
}

function LiteratureReportStudioShell({
  reportId,
  width,
  onClose,
  onOpenSavedReport,
}: {
  reportId: Id<"literatureReports">;
  width: number;
  onClose: () => void;
  onOpenSavedReport?: (reportId: Id<"reports">) => void;
}) {
  const detail = useLiteratureReportDetail(reportId);
  const saveAsStudioReport = useSaveLiteratureReportAsStudioReport();
  const { success: toastSuccess, error: toastError } = useToast();

  const handleSaveAndEdit = useCallback(async () => {
    try {
      const savedReportId = await saveAsStudioReport({ reportId });
      toastSuccess("Report saved to Studio");
      onOpenSavedReport?.(savedReportId);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save report");
    }
  }, [onOpenSavedReport, reportId, saveAsStudioReport, toastError, toastSuccess]);

  return (
    <PanelShell width={width}>
      {!detail ? (
        <LoadingState />
      ) : (
        <LiteratureReportView
          report={{
            title: detail.report.title,
            content: detail.report.content,
            citationStyle: (detail.report.citationStyle as CitationStyle) || "apa7",
            sections: detail.report.sections,
            citationIds: detail.report.citationIds,
          }}
          toolbarLabel={literatureReportToolbarLabel(detail.report.literatureReviewSessionId)}
          citations={detail.citations}
          workflowProvenance={detail.workflowProvenance}
          onBack={onClose}
          onSaveAndEdit={handleSaveAndEdit}
        />
      )}
    </PanelShell>
  );
}

function PanelShell({
  width,
  children,
  variant = "default",
}: {
  width: number;
  children: React.ReactNode;
  variant?: "default" | "table";
}) {
  const shellClass =
    variant === "table"
      ? "relative shrink-0 bg-background border-l border-border/70 h-full flex flex-col overflow-hidden"
      : "relative shrink-0 bg-sidebar border-l-2 border-border h-full flex flex-col overflow-hidden";

  return (
    <div style={{ width }} className={shellClass}>
      <ResizeHandle width={width} position="left" />
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
