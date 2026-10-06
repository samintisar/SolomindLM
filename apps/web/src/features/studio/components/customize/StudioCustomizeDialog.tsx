import { ChevronLeft, X } from "lucide-react";
import { createContext, type ReactNode, useContext, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FieldGroup } from "@/shared/components/ui/field";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import { type StudioTypeKey, studioTypeStyleForKey } from "../../studioTypeStyle";
import { StudioModalDiscoverPromptsButton } from "../StudioModalDiscoverPromptsButton";
import { type StudioDialogTheme, StudioDialogThemeContext } from "./dialogTheme";

const PreviewContext = createContext(false);

/**
 * True inside a marketing preview (the landing and sign-in mock-ups). There, the header drops
 * "Discover Prompts" and PromptField drops "Save as reusable prompt": both need a signed-in library.
 */
export function useStudioCustomizePreview(): boolean {
  return useContext(PreviewContext);
}

/**
 * The Customize dialogs have no DialogTrigger (the Studio panel opens them), so Radix has nothing to
 * focus on close and focus would fall to <body>. This remembers what had focus when the dialog
 * opened (Radix calls onOpenAutoFocus before it moves focus in) and gives focus back on close,
 * unless the user has since put focus somewhere else, such as a control clicked outside a
 * non-modal embedded dialog.
 */
function useReturnFocusToOpener() {
  const openerRef = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const opener = openerRef.current;
      openerRef.current = null;
      const active = document.activeElement;
      const focusIsFree = active === null || active === document.body;
      if (opener?.isConnected && focusIsFree) {
        event.preventDefault();
        opener.focus();
      }
    },
  };
}

interface StudioCustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Preview mock-ups (the landing hero): the dialog opens inside the nearest positioned ancestor,
   * non-modal, instead of covering the page.
   */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page); the dialog portals to <body>. */
  theme?: StudioDialogTheme;
  /**
   * A marketing preview (landing and sign-in mock-ups): hides the prompt-library actions. It's
   * separate from `embedded`, because the sign-in page's previews open full-screen.
   */
  preview?: boolean;
  /** The wider panel, for dialogs with a grid of format or style cards. */
  wide?: boolean;
  /** The dialog's form. Mounted only while open, so every open starts from its defaults. */
  children: ReactNode;
}

/** The shell every Studio Customize dialog shares. Children render the header, body and footer. */
export function StudioCustomizeDialog({
  open,
  onClose,
  embedded = false,
  theme = "default",
  preview = false,
  wide = false,
  children,
}: StudioCustomizeDialogProps) {
  // Embedded: a frame over the mock-up that the dialog portals into. Its translate makes it the
  // containing block for the content's `position: fixed`, so the dialog centres in the mock-up
  // (the /dev/design Frame trick). It paints the scrim itself, since non-modal Radix dialogs draw
  // none, and stays mounted so the closing fade has somewhere to render. The scrim transitions its
  // fill and blur (not the frame's opacity, which would also fade the dialog inside it), so it fades
  // out in step with the content.
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const returnFocus = useReturnFocusToOpener();
  return (
    <>
      {embedded && (
        <div
          ref={setFrame}
          data-slot="studio-customize-frame"
          className={cn(
            "absolute inset-0 z-50 translate-x-0 transition duration-200 ease-out",
            open ? "bg-overlay backdrop-blur-xs" : "pointer-events-none"
          )}
        />
      )}
      <Dialog
        open={open && (!embedded || frame !== null)}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        modal={!embedded}
      >
        <DialogContent
          container={embedded ? frame : undefined}
          {...returnFocus}
          showCloseButton={false}
          size="wide"
          padding="none"
          theme={theme}
          className={cn(wide && "sm:max-w-4xl")}
        >
          <StudioDialogThemeContext.Provider value={theme}>
            <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
          </StudioDialogThemeContext.Provider>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface StudioCustomizeHeaderProps {
  kind: StudioTypeKey;
  /** Kept word for word: e2e tests find the dialogs by these headings. */
  title: string;
  description: string;
  /** Adds "Discover Prompts" (not in previews); a chosen library prompt goes to `onApplyPrompt`. */
  promptLibrary?: { studioTool: StudioTool; onApplyPrompt: (promptText: string) => void };
  /** The second step of a two-step dialog: a Back button before the icon. */
  onBack?: () => void;
}

export function StudioCustomizeHeader({
  kind,
  title,
  description,
  promptLibrary,
  onBack,
}: StudioCustomizeHeaderProps) {
  const { icon: Icon, tileClass } = studioTypeStyleForKey(kind);
  const preview = useStudioCustomizePreview();
  return (
    <div className="flex items-start gap-3 px-6 pt-6 pb-4">
      {onBack && (
        <Button variant="ghost" size="icon-sm" aria-label="Back to formats" onClick={onBack}>
          <ChevronLeft />
        </Button>
      )}
      <span
        aria-hidden
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tileClass)}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {promptLibrary && !preview && (
          <StudioModalDiscoverPromptsButton
            studioTool={promptLibrary.studioTool}
            onApplyPrompt={promptLibrary.onApplyPrompt}
          />
        )}
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <X />
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}

/** The scrolling middle of a Customize dialog; its children are form fields. */
export function StudioCustomizeBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-4">
      <FieldGroup>{children}</FieldGroup>
    </div>
  );
}

/**
 * Cancel, then the dialog's Generate button (its children). A step that generates from its cards
 * (the Report/Spreadsheet format grid) passes none and gets Cancel alone.
 */
export function StudioCustomizeFooter({ children }: { children?: ReactNode }) {
  return (
    <div className="px-6 pt-2 pb-6">
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        {children}
      </DialogFooter>
    </div>
  );
}
