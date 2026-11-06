// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useAction: vi.fn(),
}));

const { useSubscriptionStatus } = await import("./subscriptionApi");

describe("useSubscriptionStatus", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("keeps the same object across rerenders while the query result is unchanged", () => {
    mockUseQuery.mockReturnValue({
      tier: "pro",
      source: "stripe",
      stripe: {
        status: "active",
        currentPeriodEnd: Date.UTC(2026, 0, 1),
        cancelAtPeriodEnd: false,
        interval: "month",
        amount: 1000,
      },
      appStore: null,
    });

    const { result, rerender } = renderHook(() => useSubscriptionStatus());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(first.hasSubscription).toBe(true);
  });

  it("keeps the same free-tier object across rerenders when there is no subscription", () => {
    mockUseQuery.mockReturnValue({ tier: "free", source: null, stripe: null, appStore: null });

    const { result, rerender } = renderHook(() => useSubscriptionStatus());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(first.plan).toBe("free");
  });

  it("returns a new object when the query result changes", () => {
    mockUseQuery.mockReturnValue(undefined);
    const { result, rerender } = renderHook(() => useSubscriptionStatus());
    const first = result.current;
    expect(first.isLoading).toBe(true);

    mockUseQuery.mockReturnValue({ tier: "free", source: null, stripe: null, appStore: null });
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.isLoading).toBe(false);
  });

  it("maps an App Store plan", () => {
    mockUseQuery.mockReturnValue({
      tier: "pro",
      source: "app_store",
      stripe: null,
      appStore: {
        productId: "com.solomindlm.app.pro.yearly",
        status: "active",
        expiresAt: Date.UTC(2027, 0, 1),
        autoRenews: false,
        environment: "Sandbox",
      },
    });
    const { result } = renderHook(() => useSubscriptionStatus());
    expect(result.current).toMatchObject({
      hasSubscription: true,
      source: "app_store",
      interval: "year",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
    });
  });
});
