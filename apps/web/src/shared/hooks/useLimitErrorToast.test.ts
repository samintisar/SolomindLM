// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockShowError = vi.fn();
const mockCreateCheckout = vi.fn();
let mockChannel: "stripe" | "app_store" | "none" = "stripe";

vi.mock("../contexts/useToast", () => ({
  useToast: () => ({ error: mockShowError }),
}));

vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useCreateCheckout: () => mockCreateCheckout,
}));

vi.mock("@/utils/platformDetection", () => ({
  canOfferPurchases: () => mockChannel !== "none",
  purchaseChannel: () => mockChannel,
  shellSupportsIap: () => mockChannel === "app_store",
}));

const { useLimitErrorToast } = await import("./useLimitErrorToast");

const dailyLimitError = new Error("Daily quiz limit reached (2/2). Upgrade for higher limits.");

describe("useLimitErrorToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel = "stripe";
    window.history.replaceState(null, "", "/");
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
    mockChannel = "none";
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError);
    });

    const [message, options] = mockShowError.mock.calls[0];
    expect(message).toBe("Daily quiz limit reached (2/2).");
    expect(options.action).toBeUndefined();
  });

  it("drops a caller's upgrade message inside the native app", async () => {
    mockChannel = "none";
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError, {
        upgradeMessage: "Upgrade to Pro for more.",
      });
    });

    expect(mockShowError.mock.calls[0][0]).toBe("Daily quiz limit reached (2/2).");
  });

  it("opens Stripe checkout from the upgrade action on the web", async () => {
    mockCreateCheckout.mockResolvedValue({ url: "about:blank#checkout" });
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError);
    });
    await act(async () => {
      await mockShowError.mock.calls[0][1].action.onClick();
    });

    expect(mockCreateCheckout).toHaveBeenCalledWith(
      "month",
      expect.any(String),
      expect.any(String)
    );
  });

  it("sends App Store builds to the Billing page, never to Stripe", async () => {
    mockChannel = "app_store";
    const onPopState = vi.fn();
    window.addEventListener("popstate", onPopState);
    const { result } = renderHook(() => useLimitErrorToast());

    await act(async () => {
      await result.current.handleLimitError(dailyLimitError);
    });
    const [, options] = mockShowError.mock.calls[0];
    expect(options.action?.label).toBe("Upgrade to Pro");
    await act(async () => {
      await options.action.onClick();
    });
    window.removeEventListener("popstate", onPopState);

    expect(mockCreateCheckout).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/billing");
    expect(onPopState).toHaveBeenCalled();
  });
});
