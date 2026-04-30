import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { AvatarDropdown } from "./AvatarDropdown";

vi.mock("./LanguageSelector", () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
}));

function renderMenu(
  overrides: Partial<ComponentProps<typeof AvatarDropdown>> = {},
) {
  const props: ComponentProps<typeof AvatarDropdown> = {
    user: { id: "u1", email: "user@example.com", name: "User" },
    isAuthenticated: true,
    onLogin: vi.fn(),
    onLogout: vi.fn(async () => {}),
    theme: "light",
    toggleTheme: vi.fn(),
    onRestartTour: vi.fn(),
    onShowChecklist: vi.fn(),
    showChecklistDismissed: false,
    ...overrides,
  };
  return { ...render(<AvatarDropdown {...props} />), props };
}

describe("AvatarDropdown onboarding actions", () => {
  test("shows restart tour for authenticated users and triggers handler", async () => {
    const user = userEvent.setup();
    const { props } = renderMenu();
    const restart = screen.getByRole("menuitem", { name: /restart tour/i });
    await user.click(restart);
    expect(props.onRestartTour).toHaveBeenCalledTimes(1);
  });

  test("shows checklist action only when dismissed and triggers handler", async () => {
    const user = userEvent.setup();
    const { props } = renderMenu({ showChecklistDismissed: true });
    const showChecklist = screen.getByRole("menuitem", {
      name: /show getting-started checklist/i,
    });
    await user.click(showChecklist);
    expect(props.onShowChecklist).toHaveBeenCalledTimes(1);
  });

  test("hides onboarding actions when unauthenticated", () => {
    renderMenu({
      user: null,
      isAuthenticated: false,
      onRestartTour: vi.fn(),
      onShowChecklist: vi.fn(),
      showChecklistDismissed: true,
    });
    expect(
      screen.queryByRole("button", { name: /restart tour/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /restart tour/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", {
        name: /show getting-started checklist/i,
      }),
    ).not.toBeInTheDocument();
  });
});
