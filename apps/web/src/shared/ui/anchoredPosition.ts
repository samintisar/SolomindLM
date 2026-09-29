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
  /** `height` is the panel's content height after its own CSS cap; `maxWidth` is its own CSS cap. */
  panel: { width: number; height: number; maxWidth?: number };
  viewport: { width: number; height: number };
  side: AnchoredSide;
  align: AnchoredAlign;
  gap?: number;
  margin?: number;
}): AnchoredPosition {
  const maxWidth = Math.min(Math.max(0, viewport.width - margin * 2), panel.maxWidth ?? Infinity);
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

const MAX_HEIGHT_VAR = "--anchored-max-height";

/**
 * Measures the panel as its own CSS sizes it, without the caps this hook applies: inline
 * `maxWidth` is cleared and the height var is set huge so `min(…, var(--anchored-max-height))`
 * resolves to the panel's own cap. Restored before returning, so nothing is painted.
 */
function measurePanel(panel: HTMLElement) {
  const { style } = panel;
  const prevMaxWidth = style.maxWidth;
  const prevMaxHeight = style.getPropertyValue(MAX_HEIGHT_VAR);
  style.maxWidth = "";
  style.setProperty(MAX_HEIGHT_VAR, "100000px");

  const computed = getComputedStyle(panel);
  const cssMaxWidth = Number.parseFloat(computed.maxWidth);
  const cssMaxHeight = Number.parseFloat(computed.maxHeight);
  const width = panel.offsetWidth;
  // scrollHeight is the content's natural height even while capped by maxHeight.
  const height = Number.isFinite(cssMaxHeight)
    ? Math.min(panel.scrollHeight, cssMaxHeight)
    : panel.scrollHeight;

  style.maxWidth = prevMaxWidth;
  if (prevMaxHeight) style.setProperty(MAX_HEIGHT_VAR, prevMaxHeight);
  else style.removeProperty(MAX_HEIGHT_VAR);

  return { width, height, maxWidth: Number.isFinite(cssMaxWidth) ? cssMaxWidth : undefined };
}

/**
 * Fixed-position style for a portaled panel anchored to `anchorRef`. The panel renders hidden
 * for one layout pass so its natural size can be measured, then is placed with
 * {@link computeAnchoredPosition}. Re-places when the anchor moves (checked every frame, so
 * scroll, resize and layout shifts are all covered), when the panel's content resizes, and when
 * the panel mounts after `open` flips.
 *
 * `maxWidth` is applied inline, never wider than the panel's own `max-w-*`. The available height
 * is exposed as `--anchored-max-height` rather than inline so panels can combine it with their
 * own cap, e.g. `max-h-[min(65vh,var(--anchored-max-height))] overflow-y-auto`. `side` is the
 * resolved side; put it on the panel as `data-side` to key entry animations off it.
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
): { style: CSSProperties; side?: AnchoredSide } {
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
        panel: measurePanel(panel),
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

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    let observedPanel: HTMLElement | null = null;
    let lastLayout = "";
    // One rect read per frame is cheaper than reacting to every scroll event, and also catches
    // anchors that move without a scroll or resize (e.g. the composer growing) and late mounts.
    const check = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (panel !== observedPanel) {
        if (observedPanel) observer?.unobserve(observedPanel);
        if (panel) observer?.observe(panel);
        observedPanel = panel;
        lastLayout = "";
      }
      if (!anchor || !panel) return;
      const r = anchor.getBoundingClientRect();
      const layout = `${r.left},${r.top},${r.right},${r.bottom},${document.documentElement.clientWidth},${window.innerHeight}`;
      if (layout === lastLayout) return;
      lastLayout = layout;
      update();
    };

    // Synchronous first check so the panel is placed before the first paint.
    check();
    let frame = 0;
    const track = () => {
      check();
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [anchorRef, panelRef, open, side, align, repositionKey]);

  if (!position) {
    return { style: { position: "fixed", top: 0, left: 0, visibility: "hidden" } };
  }
  return {
    side: position.side,
    style: {
      position: "fixed",
      left: position.left,
      top: position.top,
      bottom: position.bottom,
      maxWidth: position.maxWidth,
      [MAX_HEIGHT_VAR as string]: `${position.maxHeight}px`,
    },
  };
}
