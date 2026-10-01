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

describe("planPackSync duplicates", () => {
  it("throws before planning when a source name matches several remote documents", () => {
    const dupes: RemotePackDoc[] = [
      { documentId: "d1", fileName: "a.pdf", status: "completed", sha256: "aaa" },
      { documentId: "d2", fileName: "a.pdf", status: "completed", sha256: "aaa" },
    ];
    expect(() => planPackSync([local[0]], dupes)).toThrow(
      'Pack notebook has 2 documents named "a.pdf"; delete the extras in the app, then re-seed.'
    );
  });
});

describe("planPackSync in-flight replace", () => {
  it.each(["pending", "processing"])(
    "throws before planning when a changed document is still %s",
    (status) => {
      const inFlight: RemotePackDoc[] = [
        { documentId: "d1", fileName: "a.pdf", status, sha256: "old" },
      ];
      expect(() => planPackSync([local[1], local[0]], inFlight)).toThrow(
        '"a.pdf" is still ingesting an older version; wait for it to finish, then re-run eval:seed (if it is stuck, delete it in the app).'
      );
    }
  );
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

  it("reports a failed document even when its hash is stale", () => {
    const docs = [
      { documentId: "d1", fileName: "a.pdf", status: "failed", sha256: "old", error: "boom" },
    ];
    expect(checkPackReady(pack, [local[0]], { notebookId: "nb", docs }).problems).toEqual([
      "a.pdf: failed (boom)",
    ]);
  });

  it("reports duplicate remote names and excludes their ids", () => {
    const docs = [
      { documentId: "d1", fileName: "a.pdf", status: "completed", sha256: "aaa" },
      { documentId: "d2", fileName: "a.pdf", status: "completed", sha256: "aaa" },
      { documentId: "d3", fileName: "b.md", status: "completed", sha256: "bbb" },
    ];
    const result = checkPackReady(pack, local.slice(0, 2), { notebookId: "nb", docs });
    expect(result.problems).toEqual(["a.pdf: 2 documents with this name"]);
    expect(result.documentIds).toEqual(["d3"]);
  });
});
