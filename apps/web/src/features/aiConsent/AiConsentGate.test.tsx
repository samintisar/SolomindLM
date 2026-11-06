import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AiConsentGate } from "./AiConsentGate";
import type { AiConsentState } from "./resolveAiConsentState";

let state: AiConsentState = "granted";
vi.mock("./useAiConsentState", () => ({ useAiConsentState: () => state }));

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
vi.mock("@/shell/AppShellFallback", () => ({
  AppShellFallback: () => <div data-testid="fallback" />,
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
  ] as const)("%s shows %s", (current, testId) => {
    state = current;
    renderGate();
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  test.each(["loading", "needsConsent", "declined"] as const)(
    "%s keeps the app unmounted",
    (current) => {
      state = current;
      renderGate();
      expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    }
  );

  test("Review and allow shows the consent screen; Not now returns to the off screen", () => {
    state = "declined";
    renderGate();
    act(() => screen.getByTestId("off-screen").click());
    expect(screen.getByTestId("consent-screen")).toBeInTheDocument();
    act(() => screen.getByTestId("consent-screen").click());
    expect(screen.getByTestId("off-screen")).toBeInTheDocument();
  });
});
