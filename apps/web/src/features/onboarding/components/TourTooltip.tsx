import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOnboarding } from "../OnboardingContext";
import { findStep, STEP_IDS, TOTAL_STEPS, type StepDefinition } from "../steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(selector: string): Rect | null {
  const elements = document.querySelectorAll(selector);
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
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
  // Only warn when more than one match is currently visible (rules out
  // responsive duplicates where Tailwind hides one variant via display:none).
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

export const TourTooltip: React.FC = () => {
  const { tourStatus, currentStepId, skip } = useOnboarding();
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

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
          next.height === prev.height
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

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 pointer-events-none"
        style={{
          clipPath: `polygon(
            0% 0%, 0% 100%, ${rect.left}px 100%,
            ${rect.left}px ${rect.top}px,
            ${rect.left + rect.width}px ${rect.top}px,
            ${rect.left + rect.width}px ${rect.top + rect.height}px,
            ${rect.left}px ${rect.top + rect.height}px,
            ${rect.left}px 100%, 100% 100%, 100% 0%
          )`,
        }}
        aria-hidden
      />
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
            onClick={() => void skip()}
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
