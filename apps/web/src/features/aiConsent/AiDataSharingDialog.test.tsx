import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation } from "convex/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastContext, type ToastContextValue } from "@/shared/contexts/useToast";
import { AiDataSharingDialog } from "./AiDataSharingDialog";
import { AI_PROVIDERS } from "./aiConsentCopy";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
const decline = vi.fn();

function makeToast(): ToastContextValue {
  return {
    toast: vi.fn(() => "t"),
    success: vi.fn(() => "t"),
    error: vi.fn(() => "t"),
    info: vi.fn(() => "t"),
    loading: vi.fn(() => "t"),
    dismiss: vi.fn(),
  };
}

function renderDialog(onOpenChange = vi.fn(), toast = makeToast()) {
  render(
    <ToastContext.Provider value={toast}>
      <AiDataSharingDialog open onOpenChange={onOpenChange} />
    </ToastContext.Provider>
  );
  return { onOpenChange, toast };
}

describe("AiDataSharingDialog", () => {
  beforeEach(() => {
    decline.mockReset().mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(decline as never);
  });

  test("lists the providers", () => {
    renderDialog();
    for (const provider of AI_PROVIDERS) {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    }
  });

  test("Turn off declines and closes", async () => {
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(decline).toHaveBeenCalledWith({});
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test("a failed Turn off shows an error and stays open", async () => {
    decline.mockRejectedValueOnce(new Error("offline"));
    const { onOpenChange, toast } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
