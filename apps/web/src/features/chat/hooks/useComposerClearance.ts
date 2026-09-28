import { type RefObject, useLayoutEffect } from "react";

/** CSS custom property the message list footer reads to size its bottom spacer. */
const COMPOSER_CLEARANCE_VAR = "--chat-composer-clearance";

/** Breathing room between the end of the last message and the top of the composer. */
const COMPOSER_GAP_PX = 16;

/** Distance from the end of the list that still counts as "scrolled to the bottom". */
const AT_BOTTOM_THRESHOLD_PX = 8;

/**
 * Keeps `COMPOSER_CLEARANCE_VAR` on `hostRef` equal to the floating composer's rendered height,
 * so the message list can always scroll its last message clear of the composer.
 *
 * The composer's height isn't fixed: the disclaimer wraps in narrow chat columns (tablet
 * three-panel layout) and the textarea grows with long drafts. Writes to the DOM directly so
 * resizes don't re-render the chat panel. If the list was scrolled to the end, it stays there
 * when the clearance changes.
 */
export function useComposerClearance(
  hostRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLElement | null>,
  scrollerRef: RefObject<HTMLElement | null>
) {
  useLayoutEffect(() => {
    const host = hostRef.current;
    const composer = composerRef.current;
    if (!host || !composer || typeof ResizeObserver === "undefined") return;

    let lastClearance = -1;
    const update = () => {
      const clearance = Math.ceil(composer.getBoundingClientRect().height) + COMPOSER_GAP_PX;
      if (clearance === lastClearance) return;
      lastClearance = clearance;

      const scroller = scrollerRef.current;
      const wasAtBottom =
        scroller != null &&
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
          AT_BOTTOM_THRESHOLD_PX;

      host.style.setProperty(COMPOSER_CLEARANCE_VAR, `${clearance}px`);

      if (wasAtBottom) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [hostRef, composerRef, scrollerRef]);
}
