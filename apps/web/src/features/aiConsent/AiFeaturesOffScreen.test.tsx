import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastContext, type ToastContextValue } from "@/shared/contexts/useToast";
import { AiFeaturesOffScreen } from "./AiFeaturesOffScreen";

const signOut = vi.fn();
vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => ({ signOut }) }));

vi.mock("@/features/auth/components/DeleteAccountDialog", () => ({
  DeleteAccountDialog: () => <div data-testid="delete-account-dialog" />,
}));

const toastError = vi.fn(() => "t");

function makeToast(): ToastContextValue {
  return {
    toast: vi.fn(() => "t"),
    success: vi.fn(() => "t"),
    error: toastError,
    info: vi.fn(() => "t"),
    loading: vi.fn(() => "t"),
    dismiss: vi.fn(),
  };
}

function renderScreen(onReview = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <ToastContext.Provider value={makeToast()}>
        <Routes>
          <Route path="/home" element={<AiFeaturesOffScreen onReview={onReview} />} />
        </Routes>
      </ToastContext.Provider>
    </MemoryRouter>
  );
  return onReview;
}

describe("AiFeaturesOffScreen", () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue(undefined);
    toastError.mockClear();
  });

  test("Review and allow returns to the consent screen", async () => {
    const onReview = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Review and allow" }));
    expect(onReview).toHaveBeenCalled();
  });

  test("Sign out calls signOut", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  test("disables the actions while sign-out is pending", async () => {
    signOut.mockReturnValue(new Promise(() => {}));
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    for (const name of ["Review and allow", "Sign out", "Delete account"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  test("a failed sign-out shows an error toast and re-enables the actions", async () => {
    signOut.mockRejectedValue(new Error("boom"));
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  test("Delete account opens the existing dialog", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByTestId("delete-account-dialog")).toBeInTheDocument();
  });

  test("links to the privacy policy", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});
