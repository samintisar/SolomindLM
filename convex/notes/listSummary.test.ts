import { describe, expect, it } from "vitest";
import {
  summarizeFlashcardRow,
  summarizeReportRow,
  summarizeUserNoteRow,
} from "./listSummary";

describe("listSummary", () => {
  it("strips report content but keeps metadata", () => {
    const row = summarizeReportRow({
      _id: "r1",
      title: "Report",
      content: "x".repeat(10_000),
      status: "completed",
      metadata: { reportType: "summary" },
    });
    expect(row).not.toHaveProperty("content");
    expect(row).toMatchObject({ title: "Report", status: "completed" });
  });

  it("replaces flashcard cardsData with count", () => {
    const row = summarizeFlashcardRow({
      _id: "f1",
      title: "Cards",
      cardsData: [{ q: "1" }, { q: "2" }],
      status: "completed",
    });
    expect(row).not.toHaveProperty("cardsData");
    expect(row).toMatchObject({ _cardsCount: 2 });
  });

  it("truncates user note content for list previews", () => {
    const row = summarizeUserNoteRow({
      _id: "n1",
      title: "Note",
      content: "a".repeat(500),
      messages: [{ role: "user", content: "hi" }],
      status: "completed",
    });
    expect(row).not.toHaveProperty("messages");
    expect((row as { content: string }).content).toHaveLength(200);
    expect(row).toMatchObject({ _contentTruncated: true });
  });
});
