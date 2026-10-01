export function stripReferencesSection(content: string): string {
  const referencesPattern = /\n?(?:References|Reference):\s*\n?[\d\s.,\-:–—]*$/i;
  const match = content.match(referencesPattern);
  if (match) {
    return content.substring(0, match.index).trim();
  }
  return content;
}

/** How a citation toggle was triggered; a keyboard toggle moves focus into the popover. */
export type RefToggleSource = "pointer" | "keyboard";

export interface RefHandlers {
  /** Pointer entered a citation chip (desktop hover intent). */
  onRefEnter: (refId: number, messageId: string, el: HTMLElement) => void;
  /** Pointer left a citation chip. */
  onRefLeave: () => void;
  /** Click/tap or Enter/Space toggles the popover for this chip. */
  onRefToggle: (
    refId: number,
    messageId: string,
    el: HTMLElement,
    source?: RefToggleSource
  ) => void;
}
