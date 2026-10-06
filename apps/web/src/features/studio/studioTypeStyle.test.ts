import { BookOpen, FileText, HelpCircle } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { Note } from "@/shared/types/index";
import { studioTypeStyle, studioTypeStyleForKey } from "./studioTypeStyle";

const note = (fields: Record<string, unknown>) =>
  ({ id: "n1", title: "T", preview: "", status: "completed", ...fields }) as unknown as Note;

describe("studioTypeStyle", () => {
  it("colours both audio note types with the audio token", () => {
    for (const type of ["audio", "audioOverview"]) {
      const style = studioTypeStyle(note({ type, metadata: {} }));
      expect(style.tileClass).toBe("bg-studio-audio/10 text-studio-audio");
      expect(style.toneClass).toBe("studio-tone-audio");
    }
  });

  it("maps written questions to the written token", () => {
    expect(studioTypeStyle(note({ type: "writtenQuestions" })).toneClass).toBe(
      "studio-tone-written"
    );
  });

  it("gives literature-review reports their own colour and a book icon", () => {
    const style = studioTypeStyle(
      note({ type: "report", metadata: { reportType: "literature_review" } })
    );
    expect(style.tileClass).toBe("bg-studio-literature/10 text-studio-literature");
    expect(style.icon).toBe(BookOpen);
  });

  it("keeps ordinary reports on the report colour", () => {
    expect(
      studioTypeStyle(note({ type: "report", metadata: { reportType: "briefing_doc" } })).toneClass
    ).toBe("studio-tone-report");
  });

  it("falls back to a muted tile for unknown types", () => {
    const style = studioTypeStyle(note({ type: "text", content: "" }));
    expect(style.tileClass).toBe("bg-muted text-muted-foreground");
    expect(style.toneClass).toBe("");
    expect(style.icon).toBe(FileText);
  });

  it.each([
    ["flashcard", "flashcard"],
    ["quiz", "quiz"],
    ["mindmap", "mindmap"],
    ["infographic", "infographic"],
    ["spreadsheet", "spreadsheet"],
    ["note", "note"],
  ])("maps %s notes to the %s tokens", (type, k) => {
    const style = studioTypeStyle(note({ type }));
    expect(style.tileClass).toBe(`bg-studio-${k}/10 text-studio-${k}`);
    expect(style.toneClass).toBe(`studio-tone-${k}`);
  });

  it("styles a type by key, for the Customize dialog headers", () => {
    const style = studioTypeStyleForKey("quiz");
    expect(style.tileClass).toBe("bg-studio-quiz/10 text-studio-quiz");
    expect(style.icon).toBe(HelpCircle);
  });
});
