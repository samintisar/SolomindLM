import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/components/ui/popover";
import type { ReferenceChunk } from "@/shared/types/index";
import type { RefHandlers } from "../utils/messageRendering.utils";
import { CitationCard } from "./CitationCard";

const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 150;

interface Target {
  refId: number;
  messageId: string;
  el: HTMLElement;
  /** Opened by click/tap/keyboard: stays open until toggled, Escape, or an outside interaction. */
  pinned: boolean;
  /** Opened from the keyboard: focus moves into the card and returns to the chip on close. */
  viaKeyboard: boolean;
}

interface Options {
  resolveReference: (messageId: string, refId: number) => ReferenceChunk | null;
  /** Returns the "open in sources" action for this reference, or undefined to hide it. */
  onOpenInSources?: (ref: ReferenceChunk) => (() => void) | undefined;
  /** Returns the "add to notebook" action for this reference, or undefined to hide it. */
  onAddToNotebook?: (ref: ReferenceChunk) => (() => void | Promise<unknown>) | undefined;
}

const isSameChip = (t: Target, refId: number, messageId: string, el: HTMLElement) =>
  t.el === el || (!t.el.isConnected && t.refId === refId && t.messageId === messageId);

/**
 * One popover per chat panel, anchored to whichever citation chip is active. A per-chip trigger
 * would break under Virtuoso, which unmounts off-screen rows.
 *
 * - Mouse hover opens after a short intent delay and closes shortly after the pointer leaves both
 *   the chip and the popover.
 * - Click/tap/Enter/Space pins it open; the same chip toggles it closed, another chip retargets.
 * - It closes when its chip scrolls out of its scroller or unmounts.
 */
export function useCitationPopover({
  resolveReference,
  onOpenInSources,
  onAddToNotebook,
}: Options) {
  const [target, setTarget] = useState<Target | null>(null);
  // The last opened target stays rendered while the popover animates closed.
  const [lastTarget, setLastTarget] = useState<Target | null>(null);
  if (target && target !== lastTarget) setLastTarget(target);
  const shown = target ?? lastTarget;

  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const interactedOutside = useRef(false);

  const clearTimers = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setTarget((t) => (t?.pinned ? t : null)), CLOSE_DELAY_MS);
  }, [clearTimers]);

  const close = useCallback(() => {
    clearTimers();
    setTarget(null);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const handlers = useMemo<RefHandlers>(
    () => ({
      onRefEnter: (refId, messageId, el) => {
        clearTimers();
        openTimer.current = setTimeout(
          () =>
            setTarget((t) =>
              t && (t.pinned || isSameChip(t, refId, messageId, el))
                ? t
                : { refId, messageId, el, pinned: false, viaKeyboard: false }
            ),
          OPEN_DELAY_MS
        );
      },
      onRefLeave: scheduleClose,
      onRefToggle: (refId, messageId, el, source = "pointer") => {
        clearTimers();
        interactedOutside.current = false;
        // Toggling the open chip closes it (whether it opened on hover or by tap); any other chip
        // opens pinned, replacing whatever was showing.
        setTarget((t) =>
          t && isSameChip(t, refId, messageId, el)
            ? null
            : { refId, messageId, el, pinned: true, viaKeyboard: source === "keyboard" }
        );
      },
    }),
    [clearTimers, scheduleClose]
  );

  // Close when the anchored chip scrolls out of its scroller or Virtuoso unmounts its row, rather
  // than leaving the popover floating at stale coordinates.
  useEffect(() => {
    if (!target) return;
    const { el } = target;
    const onScroll = (e: Event) => {
      if (!el.isConnected) {
        close();
        return;
      }
      const scroller = e.target;
      if (!(scroller instanceof Element) || !scroller.contains(el)) return;
      const chip = el.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (chip.bottom < view.top || chip.top > view.bottom) close();
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [target, close]);

  const reference = shown ? resolveReference(shown.messageId, shown.refId) : null;
  const anchorRef = useMemo(() => ({ current: shown?.el ?? null }), [shown]);

  const openInSources = reference ? onOpenInSources?.(reference) : undefined;
  const addToNotebook = reference ? onAddToNotebook?.(reference) : undefined;

  const popover = (
    <Popover open={!!(target && reference)} onOpenChange={(open) => !open && close()}>
      <PopoverAnchor virtualRef={anchorRef} />
      {shown && reference && (
        <PopoverContent
          key={`${shown.messageId}:${shown.refId}`}
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={16}
          padding="none"
          aria-label={`Reference ${shown.refId}`}
          className="flex max-h-(--radix-popover-content-available-height) w-96 max-w-(--radix-popover-content-available-width) flex-col"
          onOpenAutoFocus={(e) => {
            if (!shown.viaKeyboard) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (shown.viaKeyboard && !interactedOutside.current && shown.el.isConnected) {
              shown.el.focus();
            }
          }}
          onPointerEnter={clearTimers}
          onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}
          onInteractOutside={(e) => {
            const el = e.target instanceof Element ? e.target : null;
            // Pressing a chip (this one or another) is handled by its own toggle: retarget or close.
            if (el && (shown.el.contains(el) || el.closest("[data-citation-chip]"))) {
              e.preventDefault();
              return;
            }
            interactedOutside.current = true;
          }}
        >
          <CitationCard
            refId={shown.refId}
            reference={reference}
            onOpenInSources={
              openInSources &&
              (() => {
                openInSources();
                close();
              })
            }
            onAddToNotebook={addToNotebook}
          />
        </PopoverContent>
      )}
    </Popover>
  );

  return { handlers, popover, close };
}
