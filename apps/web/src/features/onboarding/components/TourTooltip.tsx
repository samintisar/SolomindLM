import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOnboarding } from "../OnboardingContext";
import { findStep, STEP_IDS, TOTAL_STEPS, type StepDefinition } from "../steps";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Spotlight hole radius from the target's computed border-radius. */
  rx: number;
}

/** Breathing room around the target so the cutout keeps rounded corners smooth. */
const SPOTLIGHT_PADDING_PX = 4;

function readRect(selector: string): Rect | null {
  const elements = document.querySelectorAll(selector);
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const style = getComputedStyle(el);
    const raw = parseFloat(style.borderTopLeftRadius);
    const cornerBase = Number.isFinite(raw) ? raw : 0;
    const innerRx = Math.min(cornerBase, r.width / 2, r.height / 2);

    let left = r.left - SPOTLIGHT_PADDING_PX;
    let top = r.top - SPOTLIGHT_PADDING_PX;
    let width = r.width + 2 * SPOTLIGHT_PADDING_PX;
    let height = r.height + 2 * SPOTLIGHT_PADDING_PX;

    if (left < 0) {
      width += left;
      left = 0;
    }
    if (top < 0) {
      height += top;
      top = 0;
    }
    if (vw > 0 && left + width > vw) width = Math.max(0, vw - left);
    if (vh > 0 && top + height > vh) height = Math.max(0, vh - top);

    const rx = Math.min(
      innerRx + SPOTLIGHT_PADDING_PX,
      width / 2,
      height / 2,
    );

    return { top, left, width, height, rx };
  }
  return null;
}

function tooltipPosition(rect: Rect, side: StepDefinition["side"]) {
  const gap = 12;
  switch (side) {
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + gap };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - gap };
    case "top":
      return { top: rect.top - gap, left: rect.left + rect.width / 2 };
    case "bottom":
      return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 };
  }
}

function anchorTransform(side: StepDefinition["side"]): string {
  switch (side) {
    case "right":
      return "translate(0, -50%)";
    case "left":
      return "translate(-100%, -50%)";
    case "top":
      return "translate(-50%, -100%)";
    case "bottom":
      return "translate(-50%, 0)";
  }
}

function logSelectorInvariants(step: StepDefinition) {
  if (!import.meta.env.DEV) return;
  const matches = document.querySelectorAll(step.targetSelector);
  if (matches.length === 0) {
    console.error(
      `[onboarding] step "${step.id}" has no element matching ${step.targetSelector}`,
    );
    return;
  }
  // Only warn when more than one match is currently visible.
  const visibleMatches = Array.from(matches).filter((el) => {
    const r = el.getBoundingClientRect();
    return !(r.width === 0 && r.height === 0);
  });
  if (visibleMatches.length > 1) {
    console.error(
      `[onboarding] step "${step.id}" has ${visibleMatches.length} visible elements:`,
      visibleMatches,
    );
  }
}

function logOnboardingError(action: string, error: unknown) {
  console.error(`[onboarding] ${action}`, error);
}

export const TourTooltip: React.FC = () => {
  const { tourStatus, currentStepId, skip } = useOnboarding();
  const { showError } = useServiceErrorToast();
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);
  const spotlightMaskId = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const step = currentStepId ? findStep(currentStepId) : null;

  useEffect(() => {
    if (!step || tourStatus !== "active") {
      setRect(null);
      return;
    }
    logSelectorInvariants(step);

    let stopped = false;
    let lastFrame = 0;
    const measure = () => {
      const next = readRect(step.targetSelector);
      setRect((prev) => {
        if (!next && !prev) return prev;
        if (
          next &&
          prev &&
          next.top === prev.top &&
          next.left === prev.left &&
          next.width === prev.width &&
          next.height === prev.height &&
          next.rx === prev.rx
        ) {
          return prev;
        }
        return next;
      });
    };
    measure();

    const onResize = () => measure();
    const onScroll = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    const observer = new MutationObserver(() => measure());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const tick = (t: number) => {
      if (stopped) return;
      if (t - lastFrame >= 100) {
        lastFrame = t;
        measure();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [step, tourStatus]);

  if (tourStatus !== "active" || !step || !rect) return null;

  const pos = tooltipPosition(rect, step.side);
  const stepNumber = STEP_IDS.indexOf(step.id) + 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const handleSkip = () => {
    void skip().catch((error) => {
      logOnboardingError("failed to skip tour", error);
      showError(error);
    });
  };

  return createPortal(
    <>
      <svg
        className="fixed inset-0 z-40 pointer-events-none"
        width={vw}
        height={vh}
        aria-hidden
      >
        <defs>
          <mask
            id={spotlightMaskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={vw}
            height={vh}
          >
            <rect width={vw} height={vh} fill="white" />
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              rx={rect.rx}
              ry={rect.rx}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width={vw}
          height={vh}
          fill="rgba(0, 0, 0, 0.42)"
          mask={`url(#${spotlightMaskId})`}
        />
      </svg>
      <div
        role="dialog"
        className="fixed z-50 max-w-xs rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-lg"
        style={{ top: pos.top, left: pos.left, transform: anchorTransform(step.side) }}
      >
        <p className="text-sm">{step.copy}</p>
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            {stepNumber} of {TOTAL_STEPS}
          </span>
          <button
            type="button"
            onClick={handleSkip}
            className="underline hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};
