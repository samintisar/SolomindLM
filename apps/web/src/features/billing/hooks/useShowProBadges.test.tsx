import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotebookContext, type NotebookContextType } from "@/features/notebooks/useNotebookContext";
import { useShowProBadges } from "./useShowProBadges";

const platform = vi.hoisted(() => ({ canOfferPurchases: vi.fn(() => true) }));
vi.mock("@/utils/platformDetection", () => platform);

function wrapperFor(hasSubscription: boolean, isLoading = false) {
  const value = {
    subscriptionStatus: { hasSubscription, isLoading },
  } as unknown as NotebookContextType;
  return ({ children }: { children: ReactNode }) => (
    <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>
  );
}

describe("useShowProBadges", () => {
  beforeEach(() => platform.canOfferPurchases.mockReturnValue(true));

  it("marks Pro features for a Free user", () => {
    const { result } = renderHook(useShowProBadges, { wrapper: wrapperFor(false) });
    expect(result.current).toBe(true);
  });

  it("hides the marks for a Pro user", () => {
    const { result } = renderHook(useShowProBadges, { wrapper: wrapperFor(true) });
    expect(result.current).toBe(false);
  });

  it("hides the marks while the subscription is still loading", () => {
    const { result } = renderHook(useShowProBadges, { wrapper: wrapperFor(false, true) });
    expect(result.current).toBe(false);
  });

  it("hides the marks in the native app, which can't sell Pro", () => {
    platform.canOfferPurchases.mockReturnValue(false);
    const { result } = renderHook(useShowProBadges, { wrapper: wrapperFor(false) });
    expect(result.current).toBe(false);
  });

  it("hides the marks outside the notebook context (e.g. marketing previews)", () => {
    const { result } = renderHook(useShowProBadges);
    expect(result.current).toBe(false);
  });
});
