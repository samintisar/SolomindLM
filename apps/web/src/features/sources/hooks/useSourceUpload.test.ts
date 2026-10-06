// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHandleLimitError = vi.fn();
const mockShowError = vi.fn();
const mockCreateDocument = vi.fn();
let mockIsNativeShell = false;

vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useUserLimits: () => ({ sourceLimit: 20, isPremium: false, isLoading: false }),
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: mockShowError, info: vi.fn() }),
}));

vi.mock("@/shared/hooks/useLimitErrorToast", () => ({
  useLimitErrorToast: () => ({ handleLimitError: mockHandleLimitError }),
}));

vi.mock("@/utils/platformDetection", () => ({
  canOfferPurchases: () => !mockIsNativeShell,
}));

vi.mock("../services/documentsApi", () => ({
  useUploadDocument: () => vi.fn(),
  useCreateDocument: () => mockCreateDocument,
}));

const { useSourceUpload } = await import("./useSourceUpload");

const file = new File(["hello"], "notes.txt", { type: "text/plain" });

async function uploadAtLimit() {
  const { result } = renderHook(() =>
    useSourceUpload({ sourcesCount: 20, userId: "user-1", noteId: "note-1" })
  );
  await act(async () => {
    await result.current.processFiles([file]);
  });
  return mockHandleLimitError.mock.calls[0][1];
}

describe("useSourceUpload source-limit toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNativeShell = false;
    mockHandleLimitError.mockResolvedValue({ isLimitError: true });
  });

  it("tells free web users they can upgrade", async () => {
    const options = await uploadAtLimit();

    expect(options.upgradeMessage).toContain("Upgrade to Pro");
  });

  it("keeps only the remove-a-source hint inside the native app", async () => {
    mockIsNativeShell = true;
    const options = await uploadAtLimit();

    expect(options).toEqual({
      errorMessage: "You've reached your source limit (20/20). Remove a source to add another.",
    });
  });
});

describe("useSourceUpload URL upload", () => {
  const urls = ["https://a.example", "https://b.example"];

  function renderUpload() {
    return renderHook(() =>
      useSourceUpload({ sourcesCount: 0, userId: "user-1", noteId: "note-1" })
    ).result;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleLimitError.mockResolvedValue({ isLimitError: false });
  });

  it("rejects after one toast when every URL fails, so the form can stay open", async () => {
    mockCreateDocument.mockRejectedValue(new Error("unreachable"));
    const result = renderUpload();

    await act(async () => {
      await expect(result.current.handleUrlUpload(urls)).rejects.toThrow();
    });

    expect(mockShowError).toHaveBeenCalledTimes(1);
    expect(mockShowError.mock.calls[0][0]).toContain("Failed to upload all URLs");
  });

  it("resolves when at least one URL is added", async () => {
    mockCreateDocument
      .mockResolvedValueOnce({ documentId: "doc-1" })
      .mockRejectedValueOnce(new Error("unreachable"));
    const result = renderUpload();

    await act(async () => {
      await expect(result.current.handleUrlUpload(urls)).resolves.toBeUndefined();
    });

    expect(mockShowError).toHaveBeenCalledTimes(1);
    expect(mockShowError.mock.calls[0][0]).toContain("Some URLs failed");
  });
});
