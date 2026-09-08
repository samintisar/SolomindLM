import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useAction: vi.fn(),
}));

const { useUserLimits } = await import("./subscriptionApi");

describe("useUserLimits", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("reports isLoading while the subscription query is still unresolved", () => {
    mockUseQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useUserLimits());

    // A Pro user's cap must not be reported as the free cap during the load
    // window — callers key their gating on isLoading instead.
    expect(result.current.isLoading).toBe(true);
  });

  it("resolves to the free tier once the query returns no subscription", () => {
    mockUseQuery.mockReturnValue(null);

    const { result } = renderHook(() => useUserLimits());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.sourceLimit).toBe(20);
    expect(result.current.notebookLimit).toBe(5);
  });

  it("resolves to the Pro tier once the query returns an active subscription", () => {
    mockUseQuery.mockReturnValue({ status: "active" });

    const { result } = renderHook(() => useUserLimits());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPremium).toBe(true);
    expect(result.current.sourceLimit).toBe(200);
    expect(result.current.notebookLimit).toBe(200);
  });
});
