import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { FeedbackProvider } from "../../feedback/FeedbackContext";
import { AvatarDropdown } from "./AvatarDropdown";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock("./LanguageSelector", () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
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

function renderMenu(overrides: Partial<ComponentProps<typeof AvatarDropdown>> = {}) {
  const props: ComponentProps<typeof AvatarDropdown> = {
    user: { id: "u1", email: "user@example.com", name: "User" },
    isAuthenticated: true,
    onLogin: vi.fn(),
    onLogout: vi.fn(async () => {}),
    theme: "light",
    toggleTheme: vi.fn(),
    onShowChecklist: vi.fn(),
    showChecklistDismissed: false,
    ...overrides,
  };
  return {
    ...render(
      <MemoryRouter>
        <FeedbackProvider>
          <AvatarDropdown {...props} />
        </FeedbackProvider>
      </MemoryRouter>
    ),
    props,
  };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Account menu" }));
}

describe("AvatarDropdown trigger", () => {
  test("shows the user's initial when signed in", () => {
    renderMenu({ user: { id: "u1", email: "zed@example.com", name: "ada lovelace" } });
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("A");
  });

  test("falls back to the email initial when there is no name", () => {
    renderMenu({ user: { id: "u1", email: "zed@example.com" } });
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("Z");
  });

  test("shows the generic user icon when signed out", () => {
    renderMenu({ user: null, isAuthenticated: false });
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveTextContent("");
    expect(trigger.querySelector("svg")).not.toBeNull();
  });
});

describe("AvatarDropdown menu", () => {
  test("shows the account label and logs out", async () => {
    const user = userEvent.setup();
    const { props } = renderMenu();
    await openMenu(user);

    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Logout" }));
    expect(props.onLogout).toHaveBeenCalledTimes(1);
  });

  test("offers Login when signed out", async () => {
    const user = userEvent.setup();
    const { props } = renderMenu({ user: null, isAuthenticated: false });
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Login" }));
    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });

  test("toggles the theme", async () => {
    const user = userEvent.setup();
    const { props } = renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Dark mode" }));
    expect(props.toggleTheme).toHaveBeenCalledTimes(1);
  });
});

describe("AvatarDropdown onboarding actions", () => {
  test("shows checklist action only when dismissed and triggers handler", async () => {
    const user = userEvent.setup();
    const { props } = renderMenu({ showChecklistDismissed: true });
    await openMenu(user);
    const showChecklist = screen.getByRole("menuitem", {
      name: /show getting-started checklist/i,
    });
    await user.click(showChecklist);
    expect(props.onShowChecklist).toHaveBeenCalledTimes(1);
  });

  test("hides onboarding actions when unauthenticated", async () => {
    const user = userEvent.setup();
    renderMenu({
      user: null,
      isAuthenticated: false,
      onShowChecklist: vi.fn(),
      showChecklistDismissed: true,
    });
    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: "Login" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", {
        name: /show getting-started checklist/i,
      })
    ).not.toBeInTheDocument();
  });
});
