import { describe, expect, it } from "vitest";
import { checkPackReady, planPackSync, type RemotePackDoc } from "./sync";
import type { UseCasePack } from "./types";

const local = [
  { fileName: "a.pdf", sha256: "aaa" },
  { fileName: "b.md", sha256: "bbb" },
  { fileName: "c.md", sha256: "ccc" },
  { fileName: "d.md", sha256: "ddd" },
];

const remote: RemotePackDoc[] = [
  { documentId: "doc-b", fileName: "b.md", status: "completed", sha256: "old" },
  { documentId: "doc-c", fileName: "c.md", status: "failed", sha256: "ccc", error: "OCR failed" },
  { documentId: "doc-d", fileName: "d.md", status: "completed", sha256: "ddd" },
  { documentId: "doc-x", fileName: "added-by-hand.pdf", status: "completed" },
];

const pack = { id: "p", notebookTitle: "P" } as UseCasePack;

describe("planPackSync", () => {
  it("uploads missing, replaces changed or failed, skips up-to-date, ignores unrelated docs", () => {
    expect(planPackSync(local, remote)).toEqual([
      { kind: "upload", fileName: "a.pdf" },
      { kind: "replace", fileName: "b.md", documentId: "doc-b", reason: "changed" },
      { kind: "replace", fileName: "c.md", documentId: "doc-c", reason: "failed" },
      { kind: "skip", fileName: "d.md", documentId: "doc-d" },
    ]);
  });

  it("skips a matching document that is still processing (the seeder waits for it)", () => {
    const processing = [
      { documentId: "d1", fileName: "a.pdf", status: "processing", sha256: "aaa" },
    ];
    expect(planPackSync([local[0]], processing)).toEqual([
      { kind: "skip", fileName: "a.pdf", documentId: "d1" },
    ]);
  });
});

describe("checkPackReady", () => {
  it("reports a missing notebook", () => {
    expect(checkPackReady(pack, local, null)).toEqual({
      useCase: "p",
      notebookId: null,
      documentIds: [],
      problems: ['notebook "P" not found in the Test folder'],
    });
  });

  it("lists per-file problems and only pack document ids", () => {
    const result = checkPackReady(pack, local, { notebookId: "nb", docs: remote });
    expect(result.notebookId).toBe("nb");
    expect(result.documentIds).toEqual(["doc-b", "doc-c", "doc-d"]);
    expect(result.problems).toEqual([
      "a.pdf: not uploaded",
      "b.md: out of date",
      "c.md: failed (OCR failed)",
    ]);
  });

  it("is ready when every source is completed and current", () => {
    const docs = local.map((f, i) => ({
      documentId: `d${i}`,
      fileName: f.fileName,
      status: "completed",
      sha256: f.sha256,
    }));
    expect(checkPackReady(pack, local, { notebookId: "nb", docs }).problems).toEqual([]);
  });
});
