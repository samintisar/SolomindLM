import { describe, expect, it } from "vitest";
import type { Note } from "@/shared/types/index";
import { mergePendingStudioNotes, prunePendingStudioNotes } from "./mergePendingStudioNotes";

const report = (id: string, title: string): Note => ({
  id,
  title,
  preview: "Report",
  type: "report",
  content: "",
  status: "generating",
  metadata: { reportType: "summary", documentIds: [] },
});

describe("mergePendingStudioNotes", () => {
  it("prepends pending notes that are not yet in the query", () => {
    const queryNotes = [report("server-1", "Existing")];
    const pendingNotes = [report("pending-1", "Starting report")];

    expect(mergePendingStudioNotes(queryNotes, pendingNotes)).toEqual([
      report("pending-1", "Starting report"),
      report("server-1", "Existing"),
    ]);
  });

  it("prefers query rows when ids overlap", () => {
    const queryNotes = [report("shared", "From server")];
    const pendingNotes = [report("shared", "Optimistic copy")];

    expect(mergePendingStudioNotes(queryNotes, pendingNotes)).toEqual([
      report("shared", "From server"),
    ]);
  });
});

describe("prunePendingStudioNotes", () => {
  it("removes pending rows once the query includes the same id", () => {
    const queryNotes = [report("real-id", "Report")];
    const pendingNotes = [
      report("placeholder", "Report"),
      report("real-id", "Report"),
    ];

    expect(prunePendingStudioNotes(queryNotes, pendingNotes)).toEqual([
      report("placeholder", "Report"),
    ]);
  });
});
