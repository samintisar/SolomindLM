import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock convex/react
const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseAction = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useAction: mockUseAction,
}));

// Mock convex/browser for imperative API
const mockClientMutation = vi.fn();
const mockClientQuery = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexClient: vi.fn().mockImplementation(function () {
    return {
      mutation: mockClientMutation,
      query: mockClientQuery,
    };
  }),
}));

// Mock the Convex API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepProxy(): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === Symbol.toPrimitive) return () => "api";
        return deepProxy();
      },
    }
  );
}

vi.mock("@convex/_generated/api", () => ({
  api: deepProxy(),
  internal: deepProxy(),
  components: deepProxy(),
}));

// Import after mock setup
const {
  useDocuments,
  useDocument,
  useCreateDocument,
  useUpdateDocument,
  useDeleteDocument,
  useRemoveManyDocuments,
  useUploadDocument,
  pollDocumentStatus,
  uploadUrl,
  uploadText,
} = await import("./documentsApi");

describe("documentsApi hooks", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockUseAction.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("useDocuments", () => {
    it("calls useQuery with notebookId when provided", () => {
      mockUseQuery.mockReturnValue([]);
      renderHook(() => useDocuments("notebook-1"));

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ notebookId: "notebook-1" })
      );
    });

    it("calls useQuery with empty args when notebookId is null", () => {
      mockUseQuery.mockReturnValue([]);
      renderHook(() => useDocuments(null));

      expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), {});
    });
  });

  describe("useDocument", () => {
    it("calls useQuery with document id", () => {
      mockUseQuery.mockReturnValue(null);
      renderHook(() => useDocument("doc-1"));

      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "doc-1" })
      );
    });

    it("skips query when id is null", () => {
      mockUseQuery.mockReturnValue(undefined);
      renderHook(() => useDocument(null));

      expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), "skip");
    });
  });

  describe("useCreateDocument", () => {
    it("calls upload mutation for paper_record type", async () => {
      const mockUpload = vi.fn().mockResolvedValue({ documentId: "doc-1" });
      mockUseMutation.mockReturnValue(mockUpload);

      const { result } = renderHook(() => useCreateDocument());
      await result.current({
        notebookId: "nb-1",
        type: "paper_record",
        fileName: "Test Paper",
        paperRecord: {
          abstract: "Abstract",
          authors: ["Author"],
          isOa: false,
        },
      });

      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          notebookId: "nb-1",
          type: "paper_record",
          fileName: "Test Paper",
          paperRecord: expect.objectContaining({
            abstract: "Abstract",
            authors: ["Author"],
            isOa: false,
          }),
        })
      );
    });

    it("calls upload mutation for file type", async () => {
      const mockUpload = vi.fn().mockResolvedValue({ documentId: "doc-1" });
      mockUseMutation.mockReturnValue(mockUpload);

      const { result } = renderHook(() => useCreateDocument());
      await result.current({
        notebookId: "nb-1",
        type: "file",
        fileName: "test.pdf",
        storageId: "storage-1",
        fileSize: 1024,
      });

      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          notebookId: "nb-1",
          type: "file",
          fileName: "test.pdf",
          storageId: "storage-1",
          fileSize: 1024,
        })
      );
    });
  });

  describe("useUpdateDocument", () => {
    it("calls update mutation with correct args", async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ _id: "doc-1", fileName: "New Title" });
      const mockWithOptimistic = vi.fn().mockReturnValue(mockUpdate);
      mockUseMutation.mockReturnValue({ withOptimisticUpdate: mockWithOptimistic });

      const { result } = renderHook(() => useUpdateDocument());
      const updated = await result.current("doc-1", { title: "New Title" });

      expect(mockWithOptimistic).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "doc-1", title: "New Title" })
      );
      expect(updated?.fileName).toBe("New Title");
    });
  });

  describe("useDeleteDocument", () => {
    it("calls remove mutation with correct id", async () => {
      const mockRemove = vi.fn().mockResolvedValue({ message: "Deleted" });
      const mockWithOptimistic = vi.fn().mockReturnValue(mockRemove);
      mockUseMutation.mockReturnValue({ withOptimisticUpdate: mockWithOptimistic });

      const { result } = renderHook(() => useDeleteDocument());
      await result.current("doc-1");

      expect(mockWithOptimistic).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "doc-1" }));
    });
  });

  describe("useRemoveManyDocuments", () => {
    it("calls removeMany mutation with ids array", async () => {
      const mockRemoveMany = vi.fn().mockResolvedValue({ deleted: 2 });
      const mockWithOptimistic = vi.fn().mockReturnValue(mockRemoveMany);
      mockUseMutation.mockReturnValue({ withOptimisticUpdate: mockWithOptimistic });

      const { result } = renderHook(() => useRemoveManyDocuments("nb-1"));
      await result.current(["doc-1", "doc-2"]);

      expect(mockWithOptimistic).toHaveBeenCalled();
      expect(mockRemoveMany).toHaveBeenCalledWith(
        expect.objectContaining({ ids: ["doc-1", "doc-2"] })
      );
    });

    it("returns early for empty array", async () => {
      const mockRemoveMany = vi.fn().mockResolvedValue({ deleted: 0 });
      const mockWithOptimistic = vi.fn().mockReturnValue(mockRemoveMany);
      mockUseMutation.mockReturnValue({ withOptimisticUpdate: mockWithOptimistic });

      const { result } = renderHook(() => useRemoveManyDocuments("nb-1"));
      await result.current([]);

      expect(mockRemoveMany).not.toHaveBeenCalled();
    });
  });

  describe("useUploadDocument", () => {
    it("uploads file to storage and creates document", async () => {
      const mockGenerateUrl = vi.fn().mockResolvedValue("https://storage.upload.url");
      const mockCreateDoc = vi.fn().mockResolvedValue({ documentId: "doc-1" });
      mockUseMutation.mockReturnValueOnce(mockGenerateUrl).mockReturnValueOnce(mockCreateDoc);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "storage-1" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { result } = renderHook(() => useUploadDocument());
      const file = new File(["test content"], "test.txt", { type: "text/plain" });
      const response = await result.current(file, "nb-1");

      expect(mockGenerateUrl).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://storage.upload.url",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "text/plain" }),
          body: file,
        })
      );
      expect(mockCreateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          notebookId: "nb-1",
          type: "file",
          storageId: "storage-1",
          fileName: "test.txt",
          fileSize: 12,
          contentType: "text/plain",
        })
      );
      expect(response.documentId).toBe("doc-1");

      vi.unstubAllGlobals();
    });

    it("throws when storage upload fails", async () => {
      const mockGenerateUrl = vi.fn().mockResolvedValue("https://storage.upload.url");
      const mockCreateDoc = vi.fn();
      mockUseMutation.mockReturnValueOnce(mockGenerateUrl).mockReturnValueOnce(mockCreateDoc);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal("fetch", mockFetch);

      const { result } = renderHook(() => useUploadDocument());
      const file = new File(["test"], "test.txt", { type: "text/plain" });

      await expect(result.current(file, "nb-1")).rejects.toThrow(
        "Failed to upload file to storage"
      );

      vi.unstubAllGlobals();
    });
  });
});

describe("documentsApi imperative functions", () => {
  beforeEach(() => {
    mockClientMutation.mockReset();
    mockClientQuery.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("pollDocumentStatus", () => {
    it("resolves when document status is completed", async () => {
      const getDocument = vi
        .fn()
        .mockReturnValueOnce({ status: "pending" })
        .mockReturnValueOnce({ status: "processing" })
        .mockReturnValueOnce({ status: "completed", _id: "doc-1" });

      const doc = await pollDocumentStatus(getDocument, undefined, 10, 10);

      expect(doc.status).toBe("completed");
      expect(getDocument).toHaveBeenCalledTimes(3);
    });

    it("resolves when document status is failed", async () => {
      const getDocument = vi
        .fn()
        .mockReturnValueOnce({ status: "processing" })
        .mockReturnValueOnce({ status: "failed", _id: "doc-1" });

      const doc = await pollDocumentStatus(getDocument, undefined, 10, 10);

      expect(doc.status).toBe("failed");
    });

    it("calls onUpdate callback with status changes", async () => {
      const getDocument = vi
        .fn()
        .mockReturnValueOnce({ status: "pending" })
        .mockReturnValueOnce({ status: "completed", _id: "doc-1" });
      const onUpdate = vi.fn();

      await pollDocumentStatus(getDocument, onUpdate, 10, 10);

      expect(onUpdate).toHaveBeenCalledWith("pending");
    });

    it("throws when document is null", async () => {
      const getDocument = vi.fn().mockReturnValue(null);

      await expect(pollDocumentStatus(getDocument, undefined, 10, 10)).rejects.toThrow(
        "Document not found"
      );
    });

    it("throws when max attempts exceeded", async () => {
      const getDocument = vi.fn().mockReturnValue({ status: "pending" });

      await expect(pollDocumentStatus(getDocument, undefined, 3, 10)).rejects.toThrow(
        "Document processing timed out"
      );
      expect(getDocument).toHaveBeenCalledTimes(3);
    });
  });

  describe("uploadUrl", () => {
    it("calls client mutation with correct args for url type", async () => {
      mockClientMutation.mockResolvedValue({ documentId: "doc-1" });

      const result = await uploadUrl("nb-1", "https://example.com", "url");

      expect(mockClientMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notebookId: "nb-1",
          type: "url",
          source: "https://example.com",
          fileName: "https://example.com",
        })
      );
      expect(result.documentId).toBe("doc-1");
      expect(result.status).toBe("success");
    });

    it("calls client mutation with correct args for youtube type", async () => {
      mockClientMutation.mockResolvedValue({ documentId: "doc-2" });

      const result = await uploadUrl("nb-1", "https://youtube.com/watch?v=abc", "youtube");

      expect(mockClientMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notebookId: "nb-1",
          type: "youtube",
          source: "https://youtube.com/watch?v=abc",
          fileName: "YouTube Video",
        })
      );
      expect(result.documentId).toBe("doc-2");
    });
  });

  describe("uploadText", () => {
    it("calls client mutation with correct args", async () => {
      mockClientMutation.mockResolvedValue({ documentId: "doc-1" });

      const result = await uploadText("nb-1", "Some pasted text content");

      expect(mockClientMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notebookId: "nb-1",
          type: "text",
          source: "Some pasted text content",
          fileName: "Pasted text",
        })
      );
      expect(result.documentId).toBe("doc-1");
      expect(result.status).toBe("success");
    });
  });
});
