import { act, render, screen } from "@testing-library/react";
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

describe("TourTooltip measuring", () => {
  const FRAME_MS = 16;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    return () => {
      vi.useRealTimers();
    };
  });

  function rectAt(left: number, top: number) {
    return {
      top,
      left,
      right: left + 100,
      bottom: top + 30,
      width: 100,
      height: 30,
      x: left,
      y: top,
      toJSON() {},
    } as DOMRect;
  }

  function spyTarget(attr: string) {
    const el = makeMeasuredTarget(attr);
    const spy = vi.fn(() => rectAt(100, 100));
    el.getBoundingClientRect = spy;
    return { el, spy };
  }

  function advanceFrames(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  function holeX() {
    return document.body
      .querySelector("svg[aria-hidden] mask")
      ?.querySelectorAll("rect")[1]
      ?.getAttribute("x");
  }

  test("DOM mutations do not force a synchronous measure", async () => {
    const { spy } = spyTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    const callsAfterMount = spy.mock.calls.length;

    await act(async () => {
      for (let i = 0; i < 50; i++) {
        const node = document.createElement("span");
        node.textContent = `token ${i}`;
        document.body.appendChild(node);
        node.setAttribute("data-i", String(i));
      }
      // Let any MutationObserver callbacks (microtasks) run.
      await Promise.resolve();
    });

    expect(spy.mock.calls.length).toBe(callsAfterMount);
  });

  test("measures at most once per frame however many scrolls and mutations land", async () => {
    const { spy } = spyTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    const callsAfterMount = spy.mock.calls.length;

    await act(async () => {
      for (let i = 0; i < 20; i++) {
        window.dispatchEvent(new Event("scroll"));
        window.dispatchEvent(new Event("resize"));
        document.body.appendChild(document.createElement("span"));
      }
      await Promise.resolve();
    });
    // Scroll and resize only flag the next frame; nothing is read synchronously.
    expect(spy.mock.calls.length).toBe(callsAfterMount);

    advanceFrames(FRAME_MS);
    expect(spy.mock.calls.length).toBe(callsAfterMount + 1);

    // Without new events the poll measures roughly every 100ms, never more than once a frame.
    const before = spy.mock.calls.length;
    advanceFrames(1000);
    const polled = spy.mock.calls.length - before;
    expect(polled).toBeGreaterThan(0);
    expect(polled).toBeLessThanOrEqual(Math.ceil(1000 / 100));
  });

  test("registers the scroll listener as passive capture and removes it on unmount", () => {
    makeMeasuredTarget("create-notebook-button");
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));

    const scrollAdd = add.mock.calls.find(([type]) => type === "scroll");
    expect(scrollAdd?.[2]).toEqual({ capture: true, passive: true });

    unmount();
    const scrollRemove = remove.mock.calls.find(
      ([type, handler]) => type === "scroll" && handler === scrollAdd?.[1]
    );
    expect(scrollRemove?.[2]).toEqual({ capture: true });
    add.mockRestore();
    remove.mockRestore();
  });

  test("follows the target on the next frame after a scroll", () => {
    const { spy } = spyTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    expect(holeX()).toBe("96");

    spy.mockImplementation(() => rectAt(300, 100));
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(holeX()).toBe("96");

    advanceFrames(FRAME_MS);
    expect(holeX()).toBe("296");
  });

  test("follows the target when it moves without any event", () => {
    const { spy } = spyTarget("create-notebook-button");
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    expect(holeX()).toBe("96");

    spy.mockImplementation(() => rectAt(200, 100));
    advanceFrames(150);
    expect(holeX()).toBe("196");
  });

  test("resizes the overlay when the viewport changes but the target does not", () => {
    spyTarget("create-notebook-button");
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    const setViewport = (width: number, height: number) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    };
    try {
      setViewport(800, 600);
      render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
      const overlay = () => document.body.querySelector("svg[aria-hidden]");
      expect(overlay()?.getAttribute("width")).toBe("800");
      expect(overlay()?.getAttribute("height")).toBe("600");

      setViewport(1400, 900);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      advanceFrames(FRAME_MS);

      expect(holeX()).toBe("96");
      expect(overlay()?.getAttribute("width")).toBe("1400");
      expect(overlay()?.getAttribute("height")).toBe("900");
      const mask = overlay()?.querySelector("mask");
      expect(mask?.getAttribute("width")).toBe("1400");
      expect(mask?.querySelector("rect")?.getAttribute("height")).toBe("900");
      expect(overlay()?.querySelector(":scope > rect")?.getAttribute("width")).toBe("1400");
    } finally {
      setViewport(originalWidth, originalHeight);
    }
  });

  test("appears when the target mounts and hides when it goes away", () => {
    render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    const { el } = spyTarget("create-notebook-button");
    advanceFrames(150);
    expect(screen.getByRole("dialog")).toHaveTextContent(/Create your first one/);

    el.remove();
    advanceFrames(150);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("stops measuring after unmount", () => {
    const { spy } = spyTarget("create-notebook-button");
    const { unmount } = render(withCtx({ tourStatus: "active", currentStepId: "createNotebook" }));
    unmount();
    const callsAfterUnmount = spy.mock.calls.length;

    window.dispatchEvent(new Event("scroll"));
    advanceFrames(1000);
    expect(spy.mock.calls.length).toBe(callsAfterUnmount);
  });
});
