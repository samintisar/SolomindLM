import { describe, expect, it } from "vitest";
import { type PackSeedApi, seedPack } from "./seedClient";
import type { LocalSourceFile } from "./sources";
import type { RemotePackDoc, RemotePackNotebook } from "./sync";
import type { SourceText, UseCasePack } from "./types";

const pack = { id: "medical-students", notebookTitle: "Medical Students" } as UseCasePack;

function file(fileName: string, sha256: string): LocalSourceFile {
  return {
    fileName,
    sha256,
    contentType: "text/markdown",
    bytes: new TextEncoder().encode(fileName),
  };
}

class FakeSeedApi implements PackSeedApi {
  calls: string[] = [];
  resolveCount = 0;
  /** Number of upcoming upload() calls that throw */
  failUploads = 0;
  /** Number of upcoming remove() calls that throw */
  failRemoves = 0;
  /** Number of upcoming add() calls that throw */
  failAdds = 0;
  /** Runs at the start of every resolve(); use it to simulate another process */
  onResolve?: (count: number) => void;
  private nextId = 1;
  private transitions: Array<{ documentId: string; atResolve: number }> = [];
  constructor(
    public notebook: RemotePackNotebook | null = null,
    /** Status that newly added documents end up with */
    public ingestTo: "completed" | "processing" | "failed" = "completed",
    /** When set, new documents report "processing" until this many resolves have passed */
    public transitionAfterPolls?: number
  ) {}
  async resolve(): Promise<RemotePackNotebook | null> {
    this.calls.push("resolve");
    this.resolveCount++;
    this.onResolve?.(this.resolveCount);
    for (const t of this.transitions) {
      if (t.atResolve <= this.resolveCount) {
        const doc = this.notebook?.docs.find((d) => d.documentId === t.documentId);
        if (doc) this.finish(doc);
      }
    }
    return this.notebook
      ? { ...this.notebook, docs: this.notebook.docs.map((d) => ({ ...d })) }
      : null;
  }
  private finish(doc: RemotePackDoc): void {
    doc.status = this.ingestTo;
    doc.error = this.ingestTo === "failed" ? "OCR failed" : undefined;
    doc.totalChunks = this.ingestTo === "completed" ? 4 : undefined;
  }
  async create(title: string): Promise<string> {
    this.calls.push(`create:${title}`);
    this.notebook = { notebookId: "nb1", docs: [] };
    return "nb1";
  }
  async upload(f: LocalSourceFile): Promise<string> {
    this.calls.push(`upload:${f.fileName}`);
    if (this.failUploads > 0) {
      this.failUploads--;
      throw new Error("upload boom");
    }
    return `st-${f.fileName}`;
  }
  async add(args: {
    notebookId: string;
    storageId: string;
    file: LocalSourceFile;
  }): Promise<string> {
    this.calls.push(`add:${args.file.fileName}`);
    if (this.failAdds > 0) {
      this.failAdds--;
      throw new Error("add boom");
    }
    const documentId = `doc${this.nextId++}`;
    const doc: RemotePackDoc = {
      documentId,
      fileName: args.file.fileName,
      status: "processing",
      sha256: args.file.sha256,
    };
    if (this.transitionAfterPolls === undefined) {
      this.finish(doc);
    } else {
      this.transitions.push({
        documentId,
        atResolve: this.resolveCount + this.transitionAfterPolls,
      });
    }
    this.notebook?.docs.push(doc);
    return documentId;
  }
  async remove(documentId: string): Promise<void> {
    this.calls.push(`remove:${documentId}`);
    if (this.failRemoves > 0) {
      this.failRemoves--;
      throw new Error("remove boom");
    }
    if (this.notebook) {
      this.notebook.docs = this.notebook.docs.filter((d) => d.documentId !== documentId);
    }
  }
  async sourceText(): Promise<SourceText[]> {
    return [];
  }
}

const fast = { pollMs: 0, sleep: async () => {} };

describe("seedPack", () => {
  it("creates the notebook and uploads every source when nothing exists", async () => {
    const api = new FakeSeedApi();
    const result = await seedPack(pack, [file("a.md", "1"), file("b.md", "2")], api, fast);
    expect(api.calls).toEqual([
      "resolve",
      "create:Medical Students",
      "upload:a.md",
      "add:a.md",
      "upload:b.md",
      "add:b.md",
      "resolve",
    ]);
    expect(result).toMatchObject({
      notebookId: "nb1",
      documentIds: ["doc1", "doc2"],
      totalChunks: 8,
    });
  });

  it("does nothing for sources that are already current", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "1" }],
    });
    await seedPack(pack, [file("a.md", "1")], api, fast);
    expect(api.calls).toEqual(["resolve", "resolve"]);
  });

  it("re-ingests a current source with reingest (upload, remove, add)", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "1" }],
    });
    const lines: string[] = [];
    await seedPack(pack, [file("a.md", "1")], api, {
      ...fast,
      reingest: true,
      log: (l) => lines.push(l),
    });
    expect(api.calls).toEqual(["resolve", "upload:a.md", "remove:d1", "add:a.md", "resolve"]);
    expect(lines).toContain("  replace a.md (reingest)");
  });

  it("uploads new bytes before removing the old document when replacing a changed source", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "old" }],
    });
    await seedPack(pack, [file("a.md", "new")], api, fast);
    expect(api.calls).toEqual(["resolve", "upload:a.md", "remove:d1", "add:a.md", "resolve"]);
  });

  it("replaces a failed document", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [
        {
          documentId: "d1",
          fileName: "a.md",
          status: "failed",
          sha256: "1",
          error: "OCR failed",
        },
      ],
    });
    const result = await seedPack(pack, [file("a.md", "1")], api, fast);
    expect(api.calls).toEqual(["resolve", "upload:a.md", "remove:d1", "add:a.md", "resolve"]);
    expect(result.documentIds).toEqual(["doc1"]);
    expect(api.notebook?.docs.map((d) => d.documentId)).toEqual(["doc1"]);
  });

  it("keeps the old document when the replacement upload fails", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "old" }],
    });
    api.failUploads = 1;
    await expect(seedPack(pack, [file("a.md", "new")], api, fast)).rejects.toThrow("upload boom");
    expect(api.calls).toEqual(["resolve", "upload:a.md"]);
    expect(api.notebook?.docs.map((d) => d.documentId)).toEqual(["d1"]);
  });

  it("names the orphaned storage id when add fails after a successful upload", async () => {
    const api = new FakeSeedApi();
    api.failAdds = 1;
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "add boom (uploaded storage st-a.md is now orphaned)"
    );
  });

  it("names the orphaned storage id when remove fails after a successful upload", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "old" }],
    });
    api.failRemoves = 1;
    const error = await seedPack(pack, [file("a.md", "new")], api, fast).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("remove boom (uploaded storage st-a.md is now orphaned)");
    expect(error.cause).toBeInstanceOf(Error);
    expect(api.calls).toEqual(["resolve", "upload:a.md", "remove:d1"]);
  });

  it("waits through processing until the document completes", async () => {
    const api = new FakeSeedApi(null, "completed", 2);
    const result = await seedPack(pack, [file("a.md", "1")], api, fast);
    expect(api.calls.filter((c) => c === "resolve").length).toBeGreaterThanOrEqual(3);
    expect(result).toMatchObject({ documentIds: ["doc1"], totalChunks: 4 });
  });

  it("leaves hand-added documents alone and out of the result", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [
        {
          documentId: "hand",
          fileName: "added-by-hand.pdf",
          status: "completed",
          sha256: "zzz",
          totalChunks: 99,
        },
      ],
    });
    const result = await seedPack(pack, [file("a.md", "1")], api, fast);
    expect(api.calls).not.toContain("remove:hand");
    expect(result.documentIds).toEqual(["doc1"]);
    expect(result.totalChunks).toBe(4);
  });

  it("recovers on re-run after an upload failure", async () => {
    const api = new FakeSeedApi();
    api.failUploads = 1;
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow("upload boom");
    api.calls = [];
    const result = await seedPack(pack, [file("a.md", "1")], api, fast);
    expect(api.calls).toEqual(["resolve", "upload:a.md", "add:a.md", "resolve"]);
    expect(result).toMatchObject({ notebookId: "nb1", documentIds: ["doc1"] });
  });

  it("fails with the ingestion error when a document fails", async () => {
    const api = new FakeSeedApi(null, "failed");
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "medical-students: ingestion failed — a.md: OCR failed"
    );
  });

  it("times out listing what is still pending and how to recover", async () => {
    const api = new FakeSeedApi(null, "processing", 100);
    let clock = 0;
    await expect(
      seedPack(pack, [file("a.md", "1")], api, {
        pollMs: 1000,
        timeoutMs: 3000,
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      })
    ).rejects.toThrow(
      "medical-students: timed out waiting for ingestion — a.md: processing. " +
        "Re-run eval:seed to keep waiting; if a document is stuck, delete it in the app " +
        "(Test folder → Medical Students) and re-run."
    );
  });

  it("refuses to plan before creating anything when an old version is still ingesting", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "processing", sha256: "old" }],
    });
    await expect(seedPack(pack, [file("a.md", "new")], api, fast)).rejects.toThrow(
      "still ingesting an older version"
    );
    expect(api.calls).toEqual(["resolve"]);
  });
});

describe("seedPack fails fast when the notebook changes underneath it", () => {
  // Resolve #1 is the initial lookup; onResolve mutations fire from #2 (the first wait poll).
  // The new document stays in flight so the loop would otherwise keep waiting.
  const seeded = () => new FakeSeedApi({ notebookId: "nb", docs: [] }, "completed", 5);

  it("throws when the notebook disappears", async () => {
    const api = seeded();
    api.onResolve = (n) => {
      if (n === 2) api.notebook = null;
    };
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      'medical-students: notebook "Medical Students" disappeared during seeding'
    );
  });

  it("throws when a source is missing after upload", async () => {
    const api = seeded();
    api.onResolve = (n) => {
      if (n === 2 && api.notebook) api.notebook.docs = [];
    };
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "medical-students: a.md is missing after upload (was it deleted, or is another eval:seed running?)"
    );
  });

  it("throws when a source has several copies", async () => {
    const api = seeded();
    api.onResolve = (n) => {
      if (n === 2 && api.notebook) {
        api.notebook.docs.push({
          documentId: "dupe",
          fileName: "a.md",
          status: "processing",
          sha256: "1",
        });
      }
    };
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "medical-students: a.md has 2 copies (is another eval:seed running?); delete the extras in the app"
    );
  });

  it("throws when another process changed a settled document", async () => {
    const api = seeded();
    api.onResolve = (n) => {
      const doc = api.notebook?.docs[0];
      if (n === 2 && doc) {
        doc.status = "completed";
        doc.sha256 = "other";
      }
    };
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "medical-students: a.md was changed by another process (is another eval:seed running?)"
    );
  });
});
