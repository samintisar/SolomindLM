import type { Id } from "@convex/_generated/dataModel";

export type ActiveLiteratureView =
  | { kind: "table"; tableId: Id<"literatureTables"> }
  | { kind: "report"; reportId: Id<"literatureReports"> }
  | { kind: "papers"; sessionId: Id<"literatureReviewSessions"> }
  | { kind: "screening"; sessionId: Id<"literatureReviewSessions"> };
