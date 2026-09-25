import { type CSSProperties, type RefObject, useLayoutEffect, useState } from "react";

export type AnchoredSide = "top" | "bottom";
export type AnchoredAlign = "start" | "end";

type Rect = { left: number; top: number; right: number; bottom: number };

export type AnchoredPosition = {
  side: AnchoredSide;
  left: number;
  /** Set when `side === "bottom"`. */
  top?: number;
  /** Set when `side === "top"`; distance from the viewport bottom so content growth stays anchored. */
  bottom?: number;
  maxWidth: number;
  maxHeight: number;
};

/**
 * Places a fixed-position panel next to its anchor so it stays inside the viewport:
 * clamps horizontally within `margin`, flips to the other side when the preferred one
 * can't fit the panel and the other has more room, and caps height to the chosen side.
 */
export function computeAnchoredPosition({
  anchor,
  panel,
  viewport,
  side,
  align,
  gap = 8,
  margin = 8,
}: {
  anchor: Rect;
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  side: AnchoredSide;
  align: AnchoredAlign;
  gap?: number;
  margin?: number;
}): AnchoredPosition {
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(panel.width, maxWidth);
  const preferredLeft = align === "start" ? anchor.left : anchor.right - width;
  const left = Math.min(Math.max(preferredLeft, margin), viewport.width - margin - width);

  const spaceAbove = Math.max(0, anchor.top - gap - margin);
  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - gap - margin);
  const preferredSpace = side === "top" ? spaceAbove : spaceBelow;
  const otherSpace = side === "top" ? spaceBelow : spaceAbove;
  const resolvedSide: AnchoredSide =
    panel.height > preferredSpace && otherSpace > preferredSpace
      ? side === "top"
        ? "bottom"
        : "top"
      : side;

  if (resolvedSide === "top") {
    return {
      side: "top",
      left,
      bottom: viewport.height - anchor.top + gap,
      maxWidth,
      maxHeight: spaceAbove,
    };
  }
  return { side: "bottom", left, top: anchor.bottom + gap, maxWidth, maxHeight: spaceBelow };
}

/**
 * Fixed-position style for a portaled panel anchored to `anchorRef`. The panel renders hidden
 * for one layout pass so its natural size can be measured, then is placed with
 * {@link computeAnchoredPosition}. Re-places on scroll, resize and panel content changes.
 *
 * `maxWidth` is applied inline. The available height is exposed as `--anchored-max-height` rather
 * than inline so panels can combine it with their own cap, e.g.
 * `max-h-[min(65vh,var(--anchored-max-height))] overflow-y-auto`.
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  {
    side = "bottom",
    align = "start",
    repositionKey,
  }: {
    side?: AnchoredSide;
    align?: AnchoredAlign;
    /** Change this when the anchor element swaps while open (e.g. one shared menu for many rows). */
    repositionKey?: unknown;
  } = {}
): CSSProperties {
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: repositionKey intentionally re-runs placement when the anchor swaps.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const next = computeAnchoredPosition({
        anchor: anchor.getBoundingClientRect(),
        // scrollHeight is the content's natural height even while capped by maxHeight.
        panel: { width: panel.offsetWidth, height: panel.scrollHeight },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
        side,
        align,
      });
      setPosition((prev) =>
        prev &&
        prev.side === next.side &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.maxWidth === next.maxWidth &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next
      );
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer =
      typeof ResizeObserver !== "undefined" && panelRef.current
        ? new ResizeObserver(() => update())
        : null;
    if (observer && panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [anchorRef, panelRef, open, side, align, repositionKey]);

  if (!position) {
    return { position: "fixed", top: 0, left: 0, visibility: "hidden" };
  }
  return {
    position: "fixed",
    left: position.left,
    top: position.top,
    bottom: position.bottom,
    maxWidth: position.maxWidth,
    ["--anchored-max-height" as string]: `${position.maxHeight}px`,
  };
}
