import { renderHook } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useAiConsentState } from "./useAiConsentState";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

const auth = { isAuthenticated: true, isLoading: false };
vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => auth }));

let inShell = true;
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => inShell }));

const mockedUseQuery = vi.mocked(useQuery);

describe("useAiConsentState", () => {
  beforeEach(() => {
    inShell = true;
    auth.isAuthenticated = true;
    auth.isLoading = false;
    mockedUseQuery.mockReset();
  });

  test("skips the query on the web", () => {
    inShell = false;
    mockedUseQuery.mockReturnValue(undefined);
    const { result } = renderHook(() => useAiConsentState());
    expect(result.current).toBe("notApplicable");
    expect(mockedUseQuery).toHaveBeenCalledWith(expect.anything(), "skip");
  });

  test("asks a signed-in shell user who has never answered", () => {
    mockedUseQuery.mockReturnValue({ signedIn: true, version: null, declined: false });
    const { result } = renderHook(() => useAiConsentState());
    expect(result.current).toBe("needsConsent");
  });

  test("keeps showing the app through an auth blip after consent", () => {
    mockedUseQuery.mockReturnValue({ signedIn: true, version: 1, declined: false });
    const { result, rerender } = renderHook(() => useAiConsentState());
    expect(result.current).toBe("granted");

    auth.isAuthenticated = false;
    mockedUseQuery.mockReturnValue(undefined);
    rerender();
    expect(result.current).toBe("granted");

    auth.isAuthenticated = true;
    mockedUseQuery.mockReturnValue({ signedIn: false });
    rerender();
    expect(result.current).toBe("granted");
  });
});
