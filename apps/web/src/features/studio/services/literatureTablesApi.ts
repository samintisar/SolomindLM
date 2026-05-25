import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

// ============================================================
// Literature Review Session Hooks
// ============================================================

export function useLiteratureReviewSession(sessionId: string | null) {
  return useQuery(
    api.studio.literature_tables.index.getLiteratureReviewSession,
    sessionId ? { sessionId: sessionId as Id<"literatureReviewSessions"> } : "skip"
  );
}

export function useLiteratureReviewScreeningDecisions(sessionId: string | null) {
  return useQuery(
    api.studio.literature_tables.index.getLiteratureReviewScreeningDecisions,
    sessionId ? { sessionId: sessionId as Id<"literatureReviewSessions"> } : "skip"
  );
}

export function useLiteratureTable(tableId: string | null) {
  return useQuery(
    api.studio.literature_tables.index.getLiteratureTable,
    tableId ? { tableId: tableId as Id<"literatureTables"> } : "skip"
  );
}

export function useLiteratureReport(reportId: string | null) {
  return useQuery(
    api.studio.literature_tables.index.getLiteratureReport,
    reportId ? { reportId: reportId as Id<"literatureReports"> } : "skip"
  );
}

export function useLiteratureReportDetail(reportId: string | null) {
  return useQuery(
    api.studio.literature_tables.index.getLiteratureReportDetail,
    reportId ? { reportId: reportId as Id<"literatureReports"> } : "skip"
  );
}

export function useRankedPapersForSession(sessionId: string | null) {
  return useQuery(
    api.studio.literature_tables.index.getRankedPapersForSession,
    sessionId ? { sessionId: sessionId as Id<"literatureReviewSessions"> } : "skip"
  );
}

export function useConfirmLiteratureReviewColumns() {
  return useMutation(api.studio.literature_tables.index.confirmLiteratureReviewColumns);
}

export function useRetryLiteratureReview() {
  return useMutation(api.studio.literature_tables.index.retryLiteratureReview);
}

export function useSaveLiteratureReportAsStudioReport() {
  return useMutation(api.studio.literature_tables.index.saveLiteratureReportAsStudioReport);
}
