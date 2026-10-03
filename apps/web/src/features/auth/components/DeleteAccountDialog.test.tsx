import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockDeleteAccount = vi.fn();
const mockSignOut = vi.fn();
const mockShowError = vi.fn();
const mockNavigate = vi.fn();
let mockHasSubscription = false;

vi.mock("convex/react", () => ({
  useAction: () => mockDeleteAccount,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../useAuth", () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

vi.mock("@/features/billing/services/subscriptionApi", () => ({
  useSubscriptionStatus: () => ({ hasSubscription: mockHasSubscription }),
}));

vi.mock("@/shared/hooks/useServiceErrorToast", () => ({
  useServiceErrorToast: () => ({ showError: mockShowError }),
}));

const { DeleteAccountDialog } = await import("./DeleteAccountDialog");

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<DeleteAccountDialog open onOpenChange={onOpenChange} />);
  return { onOpenChange, deleteButton: screen.getByRole("button", { name: "Delete account" }) };
}

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSubscription = false;
    mockDeleteAccount.mockResolvedValue(null);
    mockSignOut.mockResolvedValue(undefined);
  });

  test("stays disabled until DELETE is typed exactly", async () => {
    const user = userEvent.setup();
    const { deleteButton } = renderDialog();
    const input = screen.getByLabelText(/type DELETE to confirm/i);

    expect(deleteButton).toBeDisabled();
    await user.type(input, "delete");
    expect(deleteButton).toBeDisabled();
    await user.clear(input);
    await user.type(input, "DELETE");
    expect(deleteButton).toBeEnabled();
  });

  test("deletes the account, then signs out", async () => {
    const user = userEvent.setup();
    const { deleteButton } = renderDialog();

    await user.type(screen.getByLabelText(/type DELETE to confirm/i), "DELETE");
    await user.click(deleteButton);

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockDeleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0]
    );
  });

  test("still leaves for sign-in when signing out of the deleted session fails", async () => {
    const user = userEvent.setup();
    mockSignOut.mockRejectedValue(new Error("session gone"));
    const { deleteButton } = renderDialog();

    await user.type(screen.getByLabelText(/type DELETE to confirm/i), "DELETE");
    await user.click(deleteButton);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/sign-in", { replace: true }));
  });

  test("shows the error and keeps the user signed in when deletion fails", async () => {
    const user = userEvent.setup();
    const failure = new Error("Stripe unavailable");
    mockDeleteAccount.mockRejectedValue(failure);
    const { deleteButton } = renderDialog();

    await user.type(screen.getByLabelText(/type DELETE to confirm/i), "DELETE");
    await user.click(deleteButton);

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(failure));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(deleteButton).toBeEnabled();
  });

  test("tells subscribers their subscription is cancelled", () => {
    mockHasSubscription = true;
    renderDialog();

    expect(screen.getByText(/subscription will be cancelled immediately/i)).toBeInTheDocument();
  });
});
