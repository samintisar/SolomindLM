import { describe, it, expect } from "vitest";
import { documentToSource } from "@/shared/utils/documentToSource";

const baseDoc = {
  _id: "doc123",
  fileName: "test.pdf",
  fileType: "file" as const,
  status: "completed" as const,
  createdAt: "2024-01-15T10:00:00Z",
  contentType: "application/pdf",
};

describe("documentToSource", () => {
  it("maps PDF file to type PDF", () => {
    const result = documentToSource({ ...baseDoc, fileName: "report.pdf" });
    expect(result.type).toBe("PDF");
    expect(result.id).toBe("doc123");
    expect(result.status).toBe("completed");
    expect(result.selected).toBe(true);
  });

  it("strips extension from file title", () => {
    const result = documentToSource({ ...baseDoc, fileName: "my report.pdf" });
    expect(result.title).toBe("my report");
  });

  it("maps YouTube fileType to YOUTUBE with url", () => {
    const result = documentToSource({
      ...baseDoc,
      fileType: "youtube",
      fileName: "Cool Video",
      fileUrl: "https://youtube.com/watch?v=123",
    });
    expect(result.type).toBe("YOUTUBE");
    expect(result.url).toBe("https://youtube.com/watch?v=123");
  });

  it("maps URL fileType to WEB with remoteRefreshKind", () => {
    const result = documentToSource({
      ...baseDoc,
      fileType: "url",
      fileName: "Article",
      fileUrl: "https://example.com/article",
    });
    expect(result.type).toBe("WEB");
    expect(result.url).toBe("https://example.com/article");
    expect(result.remoteRefreshKind).toBe("url");
  });

  it("maps text fileType to TXT", () => {
    const result = documentToSource({
      ...baseDoc,
      fileType: "text",
      fileName: "Notes",
    });
    expect(result.type).toBe("TXT");
  });

  it("maps DOCX/DOC/PPTX extensions correctly", () => {
    expect(documentToSource({ ...baseDoc, fileName: "a.docx" }).type).toBe("DOCX");
    expect(documentToSource({ ...baseDoc, fileName: "a.doc" }).type).toBe("DOC");
    expect(documentToSource({ ...baseDoc, fileName: "a.pptx" }).type).toBe("PPTX");
    expect(documentToSource({ ...baseDoc, fileName: "a.ppt" }).type).toBe("PPT");
    expect(documentToSource({ ...baseDoc, fileName: "a.xlsx" }).type).toBe("XLSX");
    expect(documentToSource({ ...baseDoc, fileName: "a.xls" }).type).toBe("XLS");
    expect(documentToSource({ ...baseDoc, fileName: "a.csv" }).type).toBe("CSV");
    expect(documentToSource({ ...baseDoc, fileName: "a.json" }).type).toBe("JSON");
    expect(documentToSource({ ...baseDoc, fileName: "a.md" }).type).toBe("MD");
  });

  it("maps image extensions to IMG", () => {
    expect(documentToSource({ ...baseDoc, fileName: "a.png" }).type).toBe("IMG");
    expect(documentToSource({ ...baseDoc, fileName: "a.jpg" }).type).toBe("IMG");
    expect(documentToSource({ ...baseDoc, fileName: "a.webp" }).type).toBe("IMG");
  });

  it("falls back to contentType for unknown extensions", () => {
    const result = documentToSource({
      ...baseDoc,
      fileName: "data.xyz",
      contentType: "application/pdf",
    });
    expect(result.type).toBe("PDF");
  });

  it("maps Google Drive file to remoteRefreshKind drive", () => {
    const result = documentToSource({
      ...baseDoc,
      fileName: "report.pdf",
      googleDriveFileId: "drive123",
    });
    expect(result.remoteRefreshKind).toBe("drive");
  });

  it("maps paper_record to PAPER with bibliographic metadata", () => {
    const result = documentToSource({
      _id: "paper1",
      fileName: "Sample Paper Title",
      fileType: "paper_record",
      fileUrl: "https://doi.org/10.1000/xyz",
      status: "completed",
      createdAt: Date.now(),
      paperRecord: {
        abstract: "Abstract text.",
        authors: ["Author One"],
        doi: "10.1000/xyz",
        isOa: true,
      },
      fulltextStatus: "available",
      ingestionStatus: "ingested",
    });
    expect(result.type).toBe("PAPER");
    expect(result.title).toBe("Sample Paper Title");
    expect(result.url).toBe("https://doi.org/10.1000/xyz");
    expect(result.paper?.doi).toBe("10.1000/xyz");
    expect(result.paper?.fulltextStatus).toBe("available");
    expect(result.paper?.ingestionStatus).toBe("ingested");
  });
});
