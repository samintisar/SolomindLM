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
      status: "active",
      currentPeriodEnd: Date.UTC(2026, 0, 1),
      cancelAtPeriodEnd: false,
      interval: "month",
      amount: 1000,
    });

    const { result, rerender } = renderHook(() => useSubscriptionStatus());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(first.hasSubscription).toBe(true);
  });

  it("keeps the same free-tier object across rerenders when there is no subscription", () => {
    mockUseQuery.mockReturnValue(null);

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

    mockUseQuery.mockReturnValue(null);
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.isLoading).toBe(false);
  });
});
