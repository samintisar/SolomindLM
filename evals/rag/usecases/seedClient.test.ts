import { describe, expect, it } from "vitest";
import { type PackSeedApi, seedPack } from "./seedClient";
import type { LocalSourceFile } from "./sources";
import type { RemotePackNotebook } from "./sync";
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
  private nextId = 1;
  constructor(
    public notebook: RemotePackNotebook | null = null,
    /** Status that newly added documents report on the next resolve */
    public ingestTo: "completed" | "processing" | "failed" = "completed"
  ) {}
  async resolve(): Promise<RemotePackNotebook | null> {
    this.calls.push("resolve");
    return this.notebook
      ? { ...this.notebook, docs: this.notebook.docs.map((d) => ({ ...d })) }
      : null;
  }
  async create(title: string): Promise<string> {
    this.calls.push(`create:${title}`);
    this.notebook = { notebookId: "nb1", docs: [] };
    return "nb1";
  }
  async upload(f: LocalSourceFile): Promise<string> {
    this.calls.push(`upload:${f.fileName}`);
    return `st-${f.fileName}`;
  }
  async add(args: {
    notebookId: string;
    storageId: string;
    file: LocalSourceFile;
  }): Promise<string> {
    this.calls.push(`add:${args.file.fileName}`);
    const documentId = `doc${this.nextId++}`;
    this.notebook?.docs.push({
      documentId,
      fileName: args.file.fileName,
      status: this.ingestTo,
      sha256: args.file.sha256,
      error: this.ingestTo === "failed" ? "OCR failed" : undefined,
      totalChunks: this.ingestTo === "completed" ? 4 : undefined,
    });
    return documentId;
  }
  async remove(documentId: string): Promise<void> {
    this.calls.push(`remove:${documentId}`);
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

  it("replaces a changed source", async () => {
    const api = new FakeSeedApi({
      notebookId: "nb",
      docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "old" }],
    });
    await seedPack(pack, [file("a.md", "new")], api, fast);
    expect(api.calls).toEqual(["resolve", "remove:d1", "upload:a.md", "add:a.md", "resolve"]);
  });

  it("fails with the ingestion error when a document fails", async () => {
    const api = new FakeSeedApi(null, "failed");
    await expect(seedPack(pack, [file("a.md", "1")], api, fast)).rejects.toThrow(
      "medical-students: ingestion failed — a.md: OCR failed"
    );
  });

  it("times out listing what is still pending", async () => {
    const api = new FakeSeedApi(null, "processing");
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
    ).rejects.toThrow("medical-students: timed out waiting for ingestion — a.md: processing");
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
