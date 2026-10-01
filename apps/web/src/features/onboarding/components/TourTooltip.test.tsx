import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { OnboardingContextValue } from "../OnboardingContext";
import { OnboardingContext } from "../OnboardingContext";
import { findStep } from "../steps";
import { TourTooltip } from "./TourTooltip";

vi.mock("@/shared/hooks/useServiceErrorToast", () => ({
  useServiceErrorToast: () => ({ showError: vi.fn() }),
}));

function withCtx(value: Partial<OnboardingContextValue>) {
  const full: OnboardingContextValue = {
    tourStatus: "active",
    currentStepId: "createNotebook",
    initFailed: false,
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

  test("logs when skip mutation fails", async () => {
    makeMeasuredTarget("chat-input");
    const failure = new Error("skip failed");
    const skip = vi.fn(async () => {
      throw failure;
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(withCtx({ tourStatus: "active", currentStepId: "askQuestion", skip }));
    await userEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(consoleSpy).toHaveBeenCalledWith("[onboarding] failed to skip tour", failure);
    consoleSpy.mockRestore();
  });

  test("renders step counter '3 of 4'", () => {
    makeMeasuredTarget("chat-input");
    render(withCtx({ tourStatus: "active", currentStepId: "askQuestion" }));
    expect(screen.getByText(/3 of 4/)).toBeInTheDocument();
  });

  test("renders the step in a popover dialog next to a masked spotlight", () => {
    makeMeasuredTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-slot", "popover-content");
    expect(dialog).toHaveTextContent(/Create your first one/);
    expect(dialog).toHaveTextContent("1 of 4");
    expect(dialog).toHaveAttribute("data-side", findStep("createNotebook")?.side);

    const spotlight = document.body.querySelector("svg[aria-hidden]");
    expect(spotlight).not.toBeNull();
    const mask = spotlight?.querySelector("mask");
    expect(mask).not.toBeNull();
    const dimmer = spotlight?.querySelector(":scope > rect");
    expect(dimmer?.getAttribute("mask")).toBe(`url(#${mask?.id})`);
    // Cutout matches the measured target plus the 4px spotlight padding.
    const hole = mask?.querySelectorAll("rect")[1];
    expect(hole?.getAttribute("x")).toBe("96");
    expect(hole?.getAttribute("y")).toBe("96");
  });

  test("does not steal focus when the tooltip opens", () => {
    makeMeasuredTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    expect(screen.getByRole("dialog")).not.toContainElement(document.activeElement as HTMLElement);
  });
});
