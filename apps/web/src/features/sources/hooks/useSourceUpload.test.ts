import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHandleLimitError = vi.fn();
let mockIsNativeShell = false;

vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useUserLimits: () => ({ sourceLimit: 20, isPremium: false, isLoading: false }),
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: vi.fn(), info: vi.fn() }),
}));

vi.mock("@/shared/hooks/useLimitErrorToast", () => ({
  useLimitErrorToast: () => ({ handleLimitError: mockHandleLimitError }),
}));

vi.mock("@/utils/platformDetection", () => ({
  canOfferPurchases: () => !mockIsNativeShell,
}));

vi.mock("../services/documentsApi", () => ({
  useUploadDocument: () => vi.fn(),
  useCreateDocument: () => vi.fn(),
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
