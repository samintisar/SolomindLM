import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { type AuthContextType, useAuth } from "./useAuth";

const authSignOut = vi.fn(() => Promise.resolve());
const signIn = vi.fn(() => Promise.resolve());
const authActions = { signIn, signOut: authSignOut };
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => authActions,
}));

const convexAuth = { isAuthenticated: true, isLoading: false };
vi.mock("convex/react", () => ({
  useConvexAuth: () => convexAuth,
  // A fresh object each call, as a new query result would be.
  useQuery: () => ({ id: "user-1", email: "a@example.test", name: "Ada", image: undefined }),
}));

vi.mock("@/utils/platformDetection", () => ({
  isNativeShell: () => false,
}));

const values: AuthContextType[] = [];
let goTo: (path: string) => void = () => {};
let currentPath = "";

/** Re-renders on every navigation, recording the context value it sees. */
function Consumer() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  values.push(auth);
  currentPath = location.pathname;
  useEffect(() => {
    goTo = navigate;
  });
  return null;
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  values.length = 0;
  authSignOut.mockClear();
});

describe("AuthProvider", () => {
  it("keeps the same context value across navigations and query results", () => {
    renderProvider();
    act(() => goTo("/notebook/1"));
    act(() => goTo("/settings"));

    expect(currentPath).toBe("/settings");
    expect(values.length).toBeGreaterThan(1);
    for (const value of values) {
      expect(value).toBe(values[0]);
    }
  });

  it("navigates to sign-in on sign out, after a route change", async () => {
    renderProvider();
    act(() => goTo("/notebook/1"));
    const auth = values.at(-1) as AuthContextType;

    await act(() => auth.signOut());

    expect(authSignOut).toHaveBeenCalledTimes(1);
    expect(currentPath).toBe("/sign-in");
  });
});
