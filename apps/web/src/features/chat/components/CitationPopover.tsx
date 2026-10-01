import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/components/ui/popover";
import type { ReferenceChunk } from "@/shared/types/index";
import type { RefHandlers, RefToggleSource } from "../utils/messageRendering.utils";
import { CitationCard } from "./CitationCard";

const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 150;

interface Target {
  refId: number;
  messageId: string;
  /** The chip element at open time; see `resolveChip` for re-rendered chips. */
  el: HTMLElement;
  /** Closest `[data-message-id]` row, used to find the chip again if it remounts. */
  root: Element | null;
  /** Index of the chip among this message's chips for the same reference (a ref can be cited twice). */
  occurrence: number;
  /** Opened by click/tap/keyboard: stays open until toggled, Escape, or an outside interaction. */
  pinned: boolean;
  /** Opened from the keyboard: focus moves to the card container. */
  viaKeyboard: boolean;
}

interface Options {
  resolveReference: (messageId: string, refId: number) => ReferenceChunk | null;
  /** Returns the "open in sources" action for this reference, or undefined to hide it. */
  onOpenInSources?: (ref: ReferenceChunk) => (() => void) | undefined;
  /** Returns the "add to notebook" action for this reference, or undefined to hide it. */
  onAddToNotebook?: (ref: ReferenceChunk) => (() => void | Promise<unknown>) | undefined;
}

function chipsFor(root: Element, messageId: string, refId: number): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-citation-chip]")).filter(
    (c) => c.dataset.citeMessageId === messageId && c.dataset.refId === String(refId)
  );
}

function makeTarget(
  refId: number,
  messageId: string,
  el: HTMLElement,
  pinned: boolean,
  viaKeyboard: boolean
): Target {
  const root = el.closest("[data-message-id]");
  const occurrence = root ? Math.max(0, chipsFor(root, messageId, refId).indexOf(el)) : 0;
  return { refId, messageId, el, root, occurrence, pinned, viaKeyboard };
}

/**
 * The live chip for a target. Markdown re-renders can replace the chip node; when the original is
 * detached, find its replacement in the same message row. Null when the chip is gone.
 */
function resolveChip(t: Target): HTMLElement | null {
  if (t.el.isConnected) return t.el;
  if (!t.root?.isConnected) return null;
  return chipsFor(t.root, t.messageId, t.refId)[t.occurrence] ?? null;
}

/**
 * One popover per chat panel, anchored to whichever citation chip is active. A per-chip trigger
 * would break under Virtuoso, which unmounts off-screen rows.
 *
 * - Mouse hover opens after a short intent delay and closes shortly after the pointer leaves both
 *   the chip and the popover.
 * - Click/tap/Enter/Space pins it open (including a hover-opened card); toggling a pinned chip
 *   closes it, and another chip retargets. While pinned, hovering other chips does nothing.
 * - It closes when its chip scrolls out of its scroller or unmounts.
 * - Focus returns to the chip on close only if it was inside the card (and the close wasn't an
 *   outside interaction or a scroll).
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

  const contentRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Focus was inside the card when it began closing. */
  const focusWasInside = useRef(false);
  /** The close came from an outside interaction or a scroll: leave focus where it is. */
  const suppressFocusRestore = useRef(false);

  const noteClosing = useCallback(() => {
    focusWasInside.current = !!contentRef.current?.contains(document.activeElement);
  }, []);

  const clearTimers = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      noteClosing();
      setTarget((t) => (t?.pinned ? t : null));
    }, CLOSE_DELAY_MS);
  }, [clearTimers, noteClosing]);

  const close = useCallback(() => {
    clearTimers();
    noteClosing();
    setTarget(null);
  }, [clearTimers, noteClosing]);

  /** Close without moving focus back to the chip. */
  const closeQuietly = useCallback(() => {
    suppressFocusRestore.current = true;
    close();
  }, [close]);

  useEffect(() => clearTimers, [clearTimers]);

  // Latest resolver for the stable handlers: a chip whose reference doesn't resolve (e.g. [7] with
  // five refs, or refs not loaded yet) never becomes the target.
  const resolveRef = useRef(resolveReference);
  useLayoutEffect(() => {
    resolveRef.current = resolveReference;
  });
  const resolves = useCallback(
    (messageId: string, refId: number) => resolveRef.current(messageId, refId) !== null,
    []
  );

  /** Focus bookkeeping belongs to one open/close cycle; start each open clean. */
  const resetFocusFlags = useCallback(() => {
    focusWasInside.current = false;
    suppressFocusRestore.current = false;
  }, []);

  const handlers = useMemo<RefHandlers>(
    () => ({
      onRefEnter: (refId, messageId, el) => {
        clearTimers();
        if (!resolves(messageId, refId)) return;
        openTimer.current = setTimeout(
          () =>
            setTarget((t) =>
              t && (t.pinned || resolveChip(t) === el)
                ? t
                : makeTarget(refId, messageId, el, false, false)
            ),
          OPEN_DELAY_MS
        );
      },
      onRefLeave: scheduleClose,
      onRefToggle: (refId, messageId, el, source: RefToggleSource = "pointer") => {
        clearTimers();
        if (!resolves(messageId, refId)) return;
        resetFocusFlags();
        const viaKeyboard = source === "keyboard";
        setTarget((t) => {
          if (t && resolveChip(t) === el) {
            // Pinned: toggle closed. Hover-opened: pin it (a click on what you're reading keeps it).
            return t.pinned ? null : { ...t, pinned: true, viaKeyboard };
          }
          return makeTarget(refId, messageId, el, true, viaKeyboard);
        });
      },
    }),
    [clearTimers, scheduleClose, resetFocusFlags, resolves]
  );

  const reference = shown ? resolveReference(shown.messageId, shown.refId) : null;
  const isOpen = !!(target && reference);

  // Every render (ChatPanel re-renders as messages change): close if the chip is gone, and keep
  // aria-expanded on the live chip, which may have been re-rendered.
  useEffect(() => {
    if (!target || !isOpen) return;
    const el = resolveChip(target);
    if (!el) {
      closeQuietly();
      return;
    }
    if (el.getAttribute("aria-expanded") !== "true") el.setAttribute("aria-expanded", "true");
  });

  useEffect(() => {
    if (!target || !isOpen) return;
    return () => resolveChip(target)?.setAttribute("aria-expanded", "false");
  }, [target, isOpen]);

  // Close when the chip scrolls out of its scroller or Virtuoso unmounts its row, rather than
  // leaving the popover floating at stale coordinates. Scrolls elsewhere (e.g. inside the card)
  // are ignored.
  useEffect(() => {
    if (!target || !isOpen) return;
    const onScroll = (e: Event) => {
      const el = resolveChip(target);
      if (!el) {
        closeQuietly();
        return;
      }
      const scroller = e.target;
      if (!(scroller instanceof Element) || !scroller.contains(el)) return;
      const chip = el.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (chip.bottom < view.top || chip.top > view.bottom) closeQuietly();
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [target, isOpen, closeQuietly]);

  // A virtual anchor that measures the live chip, so a re-rendered chip doesn't leave the popover
  // measuring a detached node (which reports a 0x0 rect at the viewport origin).
  const anchorRef = useMemo(() => {
    if (!shown) return { current: null };
    let lastRect = shown.el.getBoundingClientRect();
    return {
      current: {
        getBoundingClientRect: () => {
          const el = resolveChip(shown);
          if (el) lastRect = el.getBoundingClientRect();
          return lastRect;
        },
        // floating-ui watches this element's scroll ancestors and size.
        get contextElement() {
          return resolveChip(shown) ?? undefined;
        },
      },
    };
  }, [shown]);

  const openInSources = reference ? onOpenInSources?.(reference) : undefined;
  const addToNotebook = reference ? onAddToNotebook?.(reference) : undefined;

  const popover = (
    <Popover open={isOpen} onOpenChange={(open) => !open && close()}>
      <PopoverAnchor virtualRef={anchorRef} />
      {shown && reference && (
        <PopoverContent
          // A keyboard pin of a hover-opened card remounts it so focus moves in.
          key={`${shown.messageId}:${shown.refId}:${shown.viaKeyboard}`}
          ref={contentRef}
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={16}
          padding="none"
          aria-label={`Reference ${shown.refId}`}
          className="flex max-h-(--radix-popover-content-available-height) w-96 max-w-(--radix-popover-content-available-width) flex-col"
          onOpenAutoFocus={(e) => {
            // Focus the card itself, not its first control: a held Enter must not activate
            // "Add to notebook", and the dialog's label is announced. Tab then reaches the actions.
            e.preventDefault();
            resetFocusFlags();
            if (shown.viaKeyboard) contentRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const el = resolveChip(shown);
            if (el && focusWasInside.current && !suppressFocusRestore.current) {
              el.focus({ preventScroll: true });
            }
            focusWasInside.current = false;
            suppressFocusRestore.current = false;
          }}
          onPointerEnter={clearTimers}
          onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}
          onInteractOutside={(e) => {
            const el = e.target instanceof Element ? e.target : null;
            // Pressing a chip (this one or another) is handled by its own toggle: retarget or close.
            if (el?.closest("[data-citation-chip]") || (el && shown.el.contains(el))) {
              e.preventDefault();
              return;
            }
            suppressFocusRestore.current = true;
          }}
        >
          <CitationCard
            refId={shown.refId}
            reference={reference}
            onOpenInSources={
              openInSources &&
              (() => {
                openInSources();
                closeQuietly();
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
