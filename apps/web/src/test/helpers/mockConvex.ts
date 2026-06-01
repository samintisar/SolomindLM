import { vi } from "vitest";

/**
 * Mock `convex/react` and `@convex-dev/auth/react` for integration tests.
 *
 * Usage in a test file:
 *   import "./test/helpers/mockConvex";  // or vi.mock("convex/react") directly
 *
 * Provides controllable mock implementations for useQuery, useMutation,
 * useAction, and useConvexAuth.
 */

// Create stable mock functions that tests can configure
export const mockUseQuery = vi.fn();
export const mockUseMutation = vi.fn();
export const mockUseAction = vi.fn();
export const mockUseConvexAuth = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useAction: mockUseAction,
  useConvexAuth: mockUseConvexAuth,
}));

export const mockUseAuthToken = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthToken: mockUseAuthToken,
}));

/**
 * Configure mock useQuery to return specific data for a given API function.
 * Resets all previous query return values.
 */
export function setupQueryReturns(returns: Record<string, unknown>) {
  mockUseQuery.mockImplementation((queryRef: any, args: any) => {
    if (args === "skip") return undefined;
    const key = queryRef.name || String(queryRef);
    return returns[key] ?? undefined;
  });
}

/**
 * Configure mock useMutation to return a specific function.
 */

export function setupMutationReturn(fn: (...args: any[]) => Promise<any>) {
  mockUseMutation.mockReturnValue(fn);
}

/**
 * Configure mock useConvexAuth to return authenticated state.
 */
export function setupAuthenticated(isAuthenticated = true, token = "mock-token") {
  mockUseConvexAuth.mockReturnValue({ isAuthenticated });
  mockUseAuthToken.mockReturnValue(Promise.resolve(token));
}
