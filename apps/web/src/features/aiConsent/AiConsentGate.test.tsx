import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AiConsentGate } from "./AiConsentGate";
import type { AiConsentState } from "./resolveAiConsentState";

let state: AiConsentState = "granted";
vi.mock("./useAiConsentState", () => ({ useAiConsentState: () => state }));

vi.mock("./useReportAiConsentToShell", () => ({ useReportAiConsentToShell: () => {} }));

vi.mock("./AiConsentScreen", () => ({
  AiConsentScreen: ({ onDeclined }: { onDeclined?: () => void }) => (
    <button type="button" data-testid="consent-screen" onClick={onDeclined}>
      consent
    </button>
  ),
}));
vi.mock("./AiFeaturesOffScreen", () => ({
  AiFeaturesOffScreen: ({ onReview }: { onReview: () => void }) => (
    <button type="button" data-testid="off-screen" onClick={onReview}>
      off
    </button>
  ),
}));
vi.mock("@/shared/components/FullScreenSpinner", () => ({
  FullScreenSpinner: () => <div data-testid="fallback" />,
}));

function renderGate() {
  return render(
    <AiConsentGate>
      <div data-testid="app" />
    </AiConsentGate>
  );
}

describe("AiConsentGate", () => {
  beforeEach(() => {
    state = "granted";
  });

  test.each([
    ["notApplicable", "app"],
    ["granted", "app"],
    ["loading", "fallback"],
    ["needsConsent", "consent-screen"],
    ["declined", "off-screen"],
  ] as const)("%s shows %s", async (current, testId) => {
    state = current;
    renderGate();
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  test.each(["loading", "needsConsent", "declined"] as const)(
    "%s keeps the app unmounted",
    async (current) => {
      state = current;
      renderGate();
      expect(screen.queryByTestId("app")).not.toBeInTheDocument();
      await screen.findByTestId(
        current === "loading"
          ? "fallback"
          : current === "needsConsent"
            ? "consent-screen"
            : "off-screen"
      );
      expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    }
  );

  test("Review and allow shows the consent screen; Not now returns to the off screen", async () => {
    state = "declined";
    renderGate();
    act(() => screen.getByTestId("off-screen").click());
    expect(await screen.findByTestId("consent-screen")).toBeInTheDocument();
    act(() => screen.getByTestId("consent-screen").click());
    expect(await screen.findByTestId("off-screen")).toBeInTheDocument();
  });

  test("returns to the off screen after a review ends in granted and consent is later declined", async () => {
    state = "declined";
    const { rerender } = renderGate();
    act(() => screen.getByTestId("off-screen").click());
    expect(await screen.findByTestId("consent-screen")).toBeInTheDocument();

    state = "granted";
    rerender(
      <AiConsentGate>
        <div data-testid="app" />
      </AiConsentGate>
    );
    expect(await screen.findByTestId("app")).toBeInTheDocument();

    state = "declined";
    rerender(
      <AiConsentGate>
        <div data-testid="app" />
      </AiConsentGate>
    );
    await waitFor(() => expect(screen.getByTestId("off-screen")).toBeInTheDocument());
  });
});
