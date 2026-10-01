import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShowError = vi.fn();
const mockCreateCheckout = vi.fn();
let mockIsNativeShell = false;

vi.mock("../contexts/useToast", () => ({
  useToast: () => ({ error: mockShowError }),
}));

vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useCreateCheckout: () => mockCreateCheckout,
}));

vi.mock("@/utils/platformDetection", () => ({
  canOfferPurchases: () => !mockIsNativeShell,
}));

const { useLimitErrorToast } = await import("./useLimitErrorToast");

const dailyLimitError = new Error("Daily quiz limit reached (2/2). Upgrade for higher limits.");

describe("useLimitErrorToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNativeShell = false;
  });

  it("offers an Upgrade to Pro action on the web", async () => {
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError);
    });

    const [message, options] = mockShowError.mock.calls[0];
    expect(message).toContain("Upgrade");
    expect(options.action?.label).toBe("Upgrade to Pro");
  });

  it("shows no upgrade copy or action inside the native app", async () => {
    mockIsNativeShell = true;
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError);
    });

    const [message, options] = mockShowError.mock.calls[0];
    expect(message).toBe("Daily quiz limit reached (2/2).");
    expect(options.action).toBeUndefined();
  });

  it("drops a caller's upgrade message inside the native app", async () => {
    mockIsNativeShell = true;
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError, {
        upgradeMessage: "Upgrade to Pro for more.",
      });
    });

    expect(mockShowError.mock.calls[0][0]).toBe("Daily quiz limit reached (2/2).");
  });
});
