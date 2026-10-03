/**
 * Open button of a card or list row. The focus ring is drawn on an `after` overlay so it paints
 * above the opaque cover band instead of under it (an inset box-shadow would be hidden).
 */
export const CARD_OPEN_BUTTON_CLASS =
  "relative outline-hidden after:pointer-events-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";
