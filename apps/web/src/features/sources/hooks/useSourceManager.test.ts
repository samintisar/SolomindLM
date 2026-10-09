// @vitest-environment jsdom
import type { DocumentSummary } from "@convex/documents/listSummary";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteDocument = vi.fn();
const updateDocument = vi.fn();
const removeMany = vi.fn();
const showError = vi.fn();

vi.mock("../services/documentsApi", () => ({
  useDeleteDocument: () => deleteDocument,
  useUpdateDocument: () => updateDocument,
  useRemoveManyDocuments: () => removeMany,
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: showError, success: vi.fn(), info: vi.fn() }),
}));

import { useSourceManager } from "./useSourceManager";

const doc = (id: string, fileName: string) =>
  ({
    _id: id,
    fileName,
    fileType: "file",
    status: "completed",
    createdAt: 0,
    _creationTime: 0,
  }) as unknown as DocumentSummary;

describe("useSourceManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("restores a source when delete fails", async () => {
    deleteDocument.mockRejectedValueOnce(new Error("nope"));
    const documents = [doc("a", "A.md"), doc("b", "B.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    await act(() => result.current.handleDeleteSource("a"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["a", "b"]);
    expect(showError).toHaveBeenCalledWith("nope");
    expect(console.error).toHaveBeenCalled();
  });

  it("restores only the failed row when two deletes overlap", async () => {
    deleteDocument.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce(undefined);
    const documents = [doc("a", "A.md"), doc("b", "B.md"), doc("c", "C.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(3));
    await act(async () => {
      await Promise.all([
        result.current.handleDeleteSource("a"),
        result.current.handleDeleteSource("b"),
      ]);
    });
    expect(result.current.sources.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("restores the old title when rename fails", async () => {
    updateDocument.mockRejectedValueOnce(new Error("denied"));
    const documents = [doc("a", "A.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    const before = result.current.sources[0].title;
    await act(() => result.current.handleRenameSource("a", "New name"));
    expect(result.current.sources[0].title).toBe(before);
    expect(showError).toHaveBeenCalledWith("denied");
    expect(console.error).toHaveBeenCalled();
  });

  it("returns the same object across rerenders until sources change", async () => {
    const documents = [doc("a", "A.md"), doc("b", "B.md")];
    const { result, rerender } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    act(() => result.current.handleToggleSource("a"));
    expect(result.current).not.toBe(first);
    expect(result.current.handleToggleSource).toBe(first.handleToggleSource);
  });

  it("keeps the delete when it succeeds", async () => {
    deleteDocument.mockResolvedValueOnce(undefined);
    const documents = [doc("a", "A.md"), doc("b", "B.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    await act(() => result.current.handleDeleteSource("a"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["b"]);
  });

  it("rebuilds sources only when a shown field changes, not on a new array", async () => {
    updateDocument.mockResolvedValueOnce(undefined);
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [doc("a", "A.md")] } }
    );
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    await act(() => result.current.handleRenameSource("a", "Local title"));

    rerender({ documents: [doc("a", "A.md")] });
    expect(result.current.sources[0].title).toBe("Local title");

    rerender({ documents: [{ ...doc("a", "A.md"), status: "failed" }] });
    await waitFor(() => expect(result.current.sources[0].status).toBe("failed"));
    expect(result.current.sources[0].title).toBe("A");
  });

  it("rebuilds a row when its source guide content changes", async () => {
    const guide = (summary: string) => ({ summary, topics: ["t"], generatedAt: 0 });
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [{ ...doc("a", "A.md"), sourceGuide: guide("Old") }] } }
    );
    await waitFor(() => expect(result.current.sources[0].sourceGuide?.summary).toBe("Old"));

    rerender({ documents: [{ ...doc("a", "A.md"), sourceGuide: guide("New") }] });
    await waitFor(() => expect(result.current.sources[0].sourceGuide?.summary).toBe("New"));
  });

  it("rebuilds a row when its fileUrl changes", async () => {
    const page = (fileUrl: string) => ({ ...doc("a", "Page"), fileType: "url", fileUrl });
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [page("https://old.example")] } }
    );
    await waitFor(() => expect(result.current.sources[0].url).toBe("https://old.example"));

    rerender({ documents: [page("https://new.example")] });
    await waitFor(() => expect(result.current.sources[0].url).toBe("https://new.example"));
  });

  it("rebuilds a row when its contentType or paper identifiers change", async () => {
    const file = (contentType: string) => ({ ...doc("a", "upload"), contentType });
    const paper = (doi: string) => ({
      ...doc("p", "Paper"),
      fileType: "paper_record",
      paperRecord: { doi },
    });
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [file("application/pdf"), paper("10.1/old")] } }
    );
    await waitFor(() => expect(result.current.sources[0].type).toBe("PDF"));
    expect(result.current.sources[1].paper?.doi).toBe("10.1/old");

    rerender({ documents: [file("image/png"), paper("10.1/new")] });
    await waitFor(() => expect(result.current.sources[0].type).toBe("IMG"));
    expect(result.current.sources[1].paper?.doi).toBe("10.1/new");
  });

  it("keeps local state when a new array repeats nested fields unchanged", async () => {
    updateDocument.mockResolvedValueOnce(undefined);
    const full = () => ({
      ...doc("a", "Page"),
      fileType: "url",
      fileUrl: "https://example.com",
      sourceGuide: { summary: "S", topics: ["t"], generatedAt: 0 },
      paperRecord: { doi: "10.1/x" },
    });
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [full()] } }
    );
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    await act(() => result.current.handleRenameSource("a", "Local title"));

    rerender({ documents: [full()] });
    expect(result.current.sources[0].title).toBe("Local title");
  });

  it("keeps a locally added row when another document changes before it arrives", async () => {
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [doc("a", "A.md")] } }
    );
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    act(() => {
      result.current.handleAddSource({ id: "new", title: "Uploading", selected: true } as never);
    });

    rerender({ documents: [{ ...doc("a", "A.md"), status: "failed" }] });
    await waitFor(() => expect(result.current.sources[1]?.status).toBe("failed"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["new", "a"]);

    rerender({ documents: [doc("new", "New.md"), { ...doc("a", "A.md"), status: "failed" }] });
    await waitFor(() => expect(result.current.sources[0].title).toBe("New"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["new", "a"]);
  });

  it("does not bring back a row whose delete is still in flight", async () => {
    let finishDelete: () => void = () => {};
    deleteDocument.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDelete = resolve;
      })
    );
    const { result, rerender } = renderHook(
      ({ documents }) => useSourceManager({ documents, notebookId: "n" }),
      { initialProps: { documents: [doc("a", "A.md"), doc("b", "B.md")] } }
    );
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.handleDeleteSource("a");
    });
    expect(result.current.sources.map((s) => s.id)).toEqual(["b"]);

    rerender({ documents: [doc("a", "A.md"), { ...doc("b", "B.md"), status: "failed" }] });
    await waitFor(() => expect(result.current.sources[0].status).toBe("failed"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["b"]);

    await act(async () => {
      finishDelete();
      await pending;
    });
  });

  it("resets local-only rows when switching between notebooks with the same document list", async () => {
    const empty: DocumentSummary[] = [];
    const { result, rerender } = renderHook(
      ({ notebookId }) => useSourceManager({ documents: empty, notebookId }),
      { initialProps: { notebookId: "n1" } }
    );
    act(() => {
      result.current.handleAddSource({
        id: "pending",
        title: "Uploading",
        selected: true,
      } as never);
    });
    expect(result.current.sources.map((s) => s.id)).toEqual(["pending"]);

    rerender({ notebookId: "n2" });
    await waitFor(() => expect(result.current.sources).toEqual([]));
  });
});
