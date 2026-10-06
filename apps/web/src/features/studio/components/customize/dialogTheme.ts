import { createContext, useContext } from "react";

/** `light` pins the light-theme tokens (`.auth-form-light`) on a dialog that portals to <body>. */
export type StudioDialogTheme = "default" | "light";

export const StudioDialogThemeContext = createContext<StudioDialogTheme>("default");

/**
 * The theme of the Customize dialog around a nested prompt dialog (Discover, Save as prompt), so
 * on the always-light auth page both use light tokens.
 */
export function useStudioDialogTheme(): StudioDialogTheme {
  return useContext(StudioDialogThemeContext);
}
