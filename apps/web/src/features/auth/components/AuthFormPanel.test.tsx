import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockSignInWithGoogle = vi.fn();
const mockSignInWithApple = vi.fn();
let mockSignInOptions: { apple: boolean } | undefined;

vi.mock("convex/react", () => ({
  useQuery: () => mockSignInOptions,
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn() }),
}));

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({
    signInWithGoogle: mockSignInWithGoogle,
    signInWithApple: mockSignInWithApple,
  }),
}));

vi.mock("@/utils/platformDetection", () => ({
  isNativeShell: () => false,
}));

const { AuthFormPanel } = await import("./AuthFormPanel");

function renderPanel(onAuthenticated = vi.fn()) {
  render(
    <MemoryRouter>
      <AuthFormPanel onAuthenticated={onAuthenticated} />
    </MemoryRouter>
  );
  return { onAuthenticated };
}

describe("AuthFormPanel sign-in options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInOptions = { apple: false };
    mockSignInWithApple.mockResolvedValue(undefined);
  });

  test("hides Sign in with Apple until it is configured", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Apple" })).not.toBeInTheDocument();
  });

  test("hides Sign in with Apple while the options are loading", () => {
    mockSignInOptions = undefined;
    renderPanel();

    expect(screen.queryByRole("button", { name: "Continue with Apple" })).not.toBeInTheDocument();
  });

  test("signs in with Apple when it is configured", async () => {
    mockSignInOptions = { apple: true };
    const user = userEvent.setup();
    const { onAuthenticated } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Continue with Apple" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled());
    expect(mockSignInWithApple).toHaveBeenCalledTimes(1);
    expect(mockSignInWithGoogle).not.toHaveBeenCalled();
  });

  test("shows an error when Apple sign-in fails", async () => {
    mockSignInOptions = { apple: true };
    mockSignInWithApple.mockRejectedValue(new Error(""));
    const user = userEvent.setup();
    const { onAuthenticated } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Continue with Apple" }));

    expect(await screen.findByText("Apple sign-in failed")).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
