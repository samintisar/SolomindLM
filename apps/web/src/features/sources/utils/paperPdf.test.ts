import { describe, expect, it } from "vitest";
import { isPdfFile, MAX_PAPER_PDF_BYTES } from "./paperPdf";

describe("isPdfFile", () => {
  it("accepts the PDF media types, ignoring case and parameters", () => {
    expect(isPdfFile({ name: "a.pdf", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "a.pdf", type: "Application/PDF; charset=binary" })).toBe(true);
    expect(isPdfFile({ name: "a", type: "application/x-pdf" })).toBe(true);
  });

  it("falls back to the extension when the browser reports no type", () => {
    expect(isPdfFile({ name: "Paper.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "paper.docx", type: "" })).toBe(false);
    expect(isPdfFile({ name: "pdf", type: "" })).toBe(false);
  });

  it("rejects other types, even when named .pdf", () => {
    expect(isPdfFile({ name: "a.pdf", type: "image/png" })).toBe(false);
    expect(isPdfFile({ name: "a.txt", type: "text/plain" })).toBe(false);
  });

  it("caps uploads at 50 MB", () => {
    expect(MAX_PAPER_PDF_BYTES).toBe(50 * 1024 * 1024);
  });
});
