// @vitest-environment jsdom
import type { Doc } from "@convex/_generated/dataModel";
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
  }) as unknown as Doc<"documents">;

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
});
