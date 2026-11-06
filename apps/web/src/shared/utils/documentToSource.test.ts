import { describe, expect, it } from "vitest";
import { documentToSource } from "./documentToSource";

const base = { _id: "d1", createdAt: 0, fileName: "https://arxiv.org/pdf/2310.11511" };

describe("documentToSource failureReason", () => {
  it("carries the stored reason for failed documents", () => {
    const source = documentToSource({
      ...base,
      fileType: "url",
      status: "failed",
      metadata: { error: "internal", userMessage: "We couldn't read the PDF at this link." },
    });
    expect(source.failureReason).toBe("We couldn't read the PDF at this link.");
  });

  it("ignores a stale reason once the document has processed", () => {
    const source = documentToSource({
      ...base,
      fileType: "url",
      status: "completed",
      metadata: { userMessage: "old failure" },
    });
    expect(source.failureReason).toBeUndefined();
  });

  it("carries the reason for paper records too", () => {
    const source = documentToSource({
      ...base,
      fileType: "paper_record",
      status: "failed",
      metadata: { userMessage: "Something went wrong while processing this source." },
    });
    expect(source.failureReason).toBe("Something went wrong while processing this source.");
  });

  it("carries the page-cap notice of a processed document", () => {
    const source = documentToSource({
      ...base,
      fileName: "Textbook.pdf",
      fileType: "file",
      status: "completed",
      metadata: { ocrNotice: "Only the first 30 pages of this file were read." },
    });
    expect(source.processingNotice).toBe("Only the first 30 pages of this file were read.");
  });

  it("shows no page-cap notice on a failed document", () => {
    const source = documentToSource({
      ...base,
      fileName: "Textbook.pdf",
      fileType: "file",
      status: "failed",
      metadata: { ocrNotice: "stale" },
    });
    expect(source.processingNotice).toBeUndefined();
  });

  it("carries a paper's full-text source", () => {
    const source = documentToSource({
      _id: "d1",
      fileName: "A paper",
      fileType: "paper_record",
      status: "completed",
      createdAt: 0,
      ingestionStatus: "ingested",
      fulltextStatus: "available",
      fullTextSource: { method: "oa_pdf", version: "acceptedVersion" },
      paperRecord: { doi: "10.1/x" },
    });
    expect(source.paper?.fullTextSource).toEqual({ method: "oa_pdf", version: "acceptedVersion" });
  });
});
