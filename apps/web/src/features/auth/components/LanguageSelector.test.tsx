import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent } from "@/shared/components/ui/dropdown-menu";
import { LanguageSelector } from "./LanguageSelector";

const setLanguage = vi.fn();

vi.mock("../hooks/useOutputLanguage", () => ({
  useOutputLanguage: () => ({
    language: "en",
    isLoading: false,
    setLanguage,
  }),
}));

// jsdom lacks the layout APIs Radix menus touch.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

function renderInMenu(isAuthenticated: boolean) {
  return render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <LanguageSelector isAuthenticated={isAuthenticated} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("LanguageSelector", () => {
  beforeEach(() => setLanguage.mockClear());

  test("opens the output language submenu with the current language checked", async () => {
    const user = userEvent.setup();
    renderInMenu(true);

    await user.click(screen.getByRole("menuitem", { name: /output language/i }));

    expect(await screen.findByRole("menuitemradio", { name: "English" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("menuitemradio", { name: "French" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  test("selecting a language saves it", async () => {
    const user = userEvent.setup();
    renderInMenu(true);

    await user.click(screen.getByRole("menuitem", { name: /output language/i }));
    // Keyboard select: jsdom's zero-size rects defeat Radix's submenu pointer-grace logic.
    (await screen.findByRole("menuitemradio", { name: "French" })).focus();
    await user.keyboard("{Enter}");

    expect(setLanguage).toHaveBeenCalledWith("fr");
  });

  test("renders nothing when signed out", () => {
    renderInMenu(false);
    expect(screen.queryByRole("menuitem", { name: /output language/i })).not.toBeInTheDocument();
  });
});
