import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";

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

export function useSaveLiteratureReportAsStudioReport() {
  return useMutation(api.studio.literature_tables.index.saveLiteratureReportAsStudioReport);
}

export function useSaveLiteratureTableAsStudioSpreadsheet() {
  return useMutation(api.studio.literature_tables.index.saveLiteratureTableAsStudioSpreadsheet);
}
