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
});
