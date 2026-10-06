import type { Id } from "@convex/_generated/dataModel";
import React, { useCallback, useState } from "react";
import { Spinner } from "@/shared/components/ui/spinner";
import { useToast } from "@/shared/contexts/useToast";
import { cn } from "@/shared/utils/cn";
import {
  useLiteratureReportDetail,
  useLiteratureTable,
  useSaveLiteratureReportAsStudioReport,
  useSaveLiteratureTableAsStudioSpreadsheet,
} from "../services/literatureTablesApi";
import type { ActiveLiteratureView } from "../types/literatureStudio";
import { literatureReportToolbarLabel } from "../utils/literatureReportLabels";
import type { CitationStyle } from "./CitationStylePicker";
import { LiteratureReportView } from "./views/LiteratureReportView";
import type { LiteratureTable } from "./views/LiteratureTableView";
import { LiteratureTableView } from "./views/LiteratureTableView";

interface LiteratureStudioViewProps {
  view: Exclude<ActiveLiteratureView, { kind: "papers" } | { kind: "screening" }>;
  notebookId: Id<"notebooks">;
  onClose: () => void;
  onOpenSavedReport?: (reportId: Id<"reports">) => void;
  onOpenSavedSpreadsheet?: (spreadsheetId: Id<"spreadsheets">) => void;
}

export const LiteratureStudioView: React.FC<LiteratureStudioViewProps> = ({
  view,
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
        onClose={onClose}
        onOpenSavedSpreadsheet={onOpenSavedSpreadsheet}
      />
    );
  }

  return (
    <LiteratureReportStudioShell
      reportId={view.reportId}
      onClose={onClose}
      onOpenSavedReport={onOpenSavedReport}
    />
  );
};

function LiteratureTableStudioShell({
  tableId,
  notebookId,
  onClose,
  onOpenSavedSpreadsheet,
}: {
  tableId: Id<"literatureTables">;
  notebookId: Id<"notebooks">;
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
            offTopicReason: paper.offTopicReason,
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
    <PanelShell variant="table">
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
              offTopicReason: p.offTopicReason,
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
  onClose,
  onOpenSavedReport,
}: {
  reportId: Id<"literatureReports">;
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
    <PanelShell>
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
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "table";
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border/50",
        variant === "table" ? "bg-background" : "bg-sidebar"
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center text-primary">
      <Spinner className="size-8" />
    </div>
  );
}
