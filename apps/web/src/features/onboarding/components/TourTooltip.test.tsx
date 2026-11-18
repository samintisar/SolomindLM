import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourTooltip } from "./TourTooltip";
import { OnboardingContext } from "../OnboardingContext";
import type { OnboardingContextValue } from "../OnboardingContext";

function withCtx(value: Partial<OnboardingContextValue>) {
  const full: OnboardingContextValue = {
    tourStatus: "active",
    currentStepId: "createNotebook",
    skip: vi.fn(async () => {}),
    ...value,
  };
  return (
    <OnboardingContext.Provider value={full}>
      <TourTooltip />
    </OnboardingContext.Provider>
  );
}

function makeMeasuredTarget(attr: string) {
  const el = document.createElement("button");
  el.setAttribute("data-onboarding", attr);
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 100,
      right: 200,
      bottom: 130,
      width: 100,
      height: 30,
      x: 100,
      y: 100,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("TourTooltip", () => {
  test("renders nothing when status is not active", () => {
    render(withCtx({ tourStatus: "skipped", currentStepId: null }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders nothing when target selector matches no element", () => {
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders tooltip text when target exists", () => {
    makeMeasuredTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    expect(screen.getByText(/Create your first one/)).toBeInTheDocument();
  });

  test("Skip button calls skip()", async () => {
    makeMeasuredTarget("chat-input");
    const skip = vi.fn(async () => {});
    render(withCtx({ tourStatus: "active", currentStepId: "askQuestion", skip }));
    await userEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(skip).toHaveBeenCalledTimes(1);
  });

  test("renders step counter '3 of 4'", () => {
    makeMeasuredTarget("chat-input");
    render(withCtx({ tourStatus: "active", currentStepId: "askQuestion" }));
    expect(screen.getByText(/3 of 4/)).toBeInTheDocument();
  });
});
