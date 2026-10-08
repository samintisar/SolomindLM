import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/components/ui/popover";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { useOnboarding } from "../OnboardingContext";
import { findStep, STEP_IDS, type StepDefinition, TOTAL_STEPS } from "../steps";

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

/** How often the rAF loop re-measures the target when no scroll or resize asked for it. */
const MEASURE_POLL_MS = 100;

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.rx === b.rx
  );
}

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

    const rx = Math.min(innerRx + SPOTLIGHT_PADDING_PX, width / 2, height / 2);

    return { top, left, width, height, rx };
  }
  return null;
}

function logSelectorInvariants(step: StepDefinition) {
  if (!import.meta.env.DEV) return;
  const matches = document.querySelectorAll(step.targetSelector);
  if (matches.length === 0) {
    console.error(`[onboarding] step "${step.id}" has no element matching ${step.targetSelector}`);
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
      visibleMatches
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
  const spotlightMaskId = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const step = currentStepId ? findStep(currentStepId) : null;

  useEffect(() => {
    if (!step || tourStatus !== "active") {
      setRect(null);
      return;
    }
    logSelectorInvariants(step);

    // Measuring forces layout, so it happens at most once per frame and only inside the
    // rAF loop: a ~100ms poll catches the target mounting, moving or unmounting, and
    // scroll/resize mark the next frame dirty so the spotlight keeps up while scrolling.
    // No MutationObserver: streaming chat mutates the DOM constantly (#425).
    let stopped = false;
    // rAF timestamps share performance.now()'s clock.
    let lastMeasuredAt = performance.now();
    let dirty = false;
    let frame = 0;
    // undefined until the first measure, so a new step always publishes its rect.
    let last: Rect | null | undefined;
    const measure = () => {
      const next = readRect(step.targetSelector);
      if (last !== undefined && sameRect(next, last)) return;
      last = next;
      setRect(next);
    };
    measure();

    const invalidate = () => {
      dirty = true;
    };
    window.addEventListener("resize", invalidate, { passive: true });
    window.addEventListener("scroll", invalidate, { capture: true, passive: true });

    const tick = (t: number) => {
      if (stopped) return;
      if (dirty || t - lastMeasuredAt >= MEASURE_POLL_MS) {
        dirty = false;
        lastMeasuredAt = t;
        measure();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, [step, tourStatus]);

  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;
  const virtualAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          const r = rectRef.current;
          return DOMRect.fromRect(
            r
              ? { x: r.left, y: r.top, width: r.width, height: r.height }
              : { x: 0, y: 0, width: 0, height: 0 }
          );
        },
      },
    }),
    []
  );

  if (tourStatus !== "active" || !step || !rect) return null;

  const stepNumber = STEP_IDS.indexOf(step.id) + 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const handleSkip = () => {
    void skip().catch((error) => {
      logOnboardingError("failed to skip tour", error);
      showError(error);
    });
  };

  return (
    <>
      {createPortal(
        <svg className="pointer-events-none fixed inset-0 z-40" width={vw} height={vh} aria-hidden>
          <defs>
            <mask
              id={spotlightMaskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={vw}
              height={vh}
            >
              <rect width={vw} height={vh} className="fill-white" />
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx={rect.rx}
                ry={rect.rx}
                className="fill-black"
              />
            </mask>
          </defs>
          <rect
            width={vw}
            height={vh}
            className="fill-black/40"
            mask={`url(#${spotlightMaskId})`}
          />
        </svg>,
        document.body
      )}
      <Popover open>
        <PopoverAnchor virtualRef={virtualAnchor} />
        <PopoverContent
          side={step.side}
          sideOffset={12}
          collisionPadding={8}
          updatePositionStrategy="always"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="max-w-xs"
        >
          <p className="text-sm">{step.copy}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {stepNumber} of {TOTAL_STEPS}
            </span>
            {/* -mr-4 cancels size sm's px-4 so the label lines up with the popover's padding edge. */}
            <Button variant="link" size="sm" className="-mr-4" onClick={handleSkip}>
              Skip tour
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};
