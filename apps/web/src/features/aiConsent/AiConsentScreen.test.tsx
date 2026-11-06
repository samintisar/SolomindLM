import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation } from "convex/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastContext, type ToastContextValue } from "@/shared/contexts/useToast";
import { AiConsentScreen } from "./AiConsentScreen";
import { AI_CONSENT_VERSION, AI_PROVIDERS } from "./aiConsentCopy";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
// The shared test mock for the generated api is a deep proxy; use distinguishable refs instead.
vi.mock("@convex/_generated/api", () => ({
  api: { userPreferences: { index: { grantAiConsent: "grant", declineAiConsent: "decline" } } },
}));

const grant = vi.fn();
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

function renderScreen(props: { onDeclined?: () => void } = {}, toast = makeToast()) {
  render(
    <MemoryRouter>
      <ToastContext.Provider value={toast}>
        <AiConsentScreen {...props} />
      </ToastContext.Provider>
    </MemoryRouter>
  );
  return toast;
}

describe("AiConsentScreen", () => {
  beforeEach(() => {
    grant.mockReset().mockResolvedValue(null);
    decline.mockReset().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((ref: unknown) =>
      ref === "grant" ? grant : decline) as never);
  });

  test("names every provider", () => {
    renderScreen();
    for (const provider of AI_PROVIDERS) {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    }
  });

  test("Allow grants the current version", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Allow and continue" }));
    expect(grant).toHaveBeenCalledWith({ version: AI_CONSENT_VERSION });
  });

  test("Not now declines and reports back", async () => {
    const onDeclined = vi.fn();
    renderScreen({ onDeclined });
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(decline).toHaveBeenCalledWith({});
    await waitFor(() => expect(onDeclined).toHaveBeenCalled());
  });

  test("a failed grant shows an error and lets the user retry", async () => {
    grant.mockRejectedValueOnce(new Error("offline"));
    const toast = renderScreen();
    const allow = screen.getByRole("button", { name: "Allow and continue" });
    await userEvent.click(allow);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(allow).toBeEnabled();
  });
});
