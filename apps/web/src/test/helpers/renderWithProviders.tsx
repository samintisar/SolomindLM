import { RenderOptions, render } from "@testing-library/react";
import { ReactNode } from "react";
import { ThemeProvider } from "@/shared/contexts/ThemeContext";
import { ToastProvider } from "@/shared/contexts/ToastContext";

interface ProviderOptions {
  withToast?: boolean;
  withTheme?: boolean;
}

/**
 * Render a component wrapped with selected context providers.
 *
 * By default, wraps with both ToastProvider and ThemeProvider.
 * Pass `{ withToast: false }` or `{ withTheme: false }` to opt out.
 */
export function renderWithProviders(ui: ReactNode, options?: RenderOptions & ProviderOptions) {
  const { withToast = true, withTheme = true, ...renderOptions } = options ?? {};

  let wrapped = ui;
  if (withToast) {
    wrapped = <ToastProvider>{wrapped}</ToastProvider>;
  }
  if (withTheme) {
    wrapped = <ThemeProvider>{wrapped}</ThemeProvider>;
  }

  return render(wrapped, renderOptions);
}
