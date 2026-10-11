import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FREE_TOOL_PAGES } from "../toolPages";
import { TOOLS_HUB_LAST_UPDATED, TOOLS_HUB_PAGE } from "../toolsHubPage";
import { ToolsHubPage } from "./ToolsHubPage";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/tools"]}>
      <ToolsHubPage />
    </MemoryRouter>
  );
}

function toolsSection() {
  const section = document.querySelector<HTMLElement>('section[aria-labelledby="tools-title"]');
  if (!section) throw new Error("no tools section");
  return section;
}

describe("ToolsHubPage", () => {
  it("has one h1, a Home › Free tools breadcrumb and the updated date", () => {
    renderHub();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(TOOLS_HUB_PAGE.h1);

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(trail).getByText("Free tools")).toHaveAttribute("aria-current", "page");

    const updated = document.querySelector(`time[datetime="${TOOLS_HUB_LAST_UPDATED}"]`);
    expect(updated).not.toBeNull();
  });

  it("links a card to every registered tool", () => {
    renderHub();
    const links = within(toolsSection()).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      FREE_TOOL_PAGES.map((tool) => tool.path)
    );
    for (const tool of FREE_TOOL_PAGES) {
      expect(within(toolsSection()).getByRole("heading", { name: tool.h1 })).toBeInTheDocument();
    }
  });

  it("shows the hub FAQ", () => {
    renderHub();
    expect(screen.getByText(TOOLS_HUB_PAGE.faqs[0]!.question)).toBeInTheDocument();
  });

  it("links the hub from the site footer's free tools column", () => {
    renderHub();
    const column = screen.getByRole("navigation", { name: "Free tools" });
    expect(within(column).getByRole("link", { name: "All free tools" })).toHaveAttribute(
      "href",
      "/tools"
    );
    for (const tool of FREE_TOOL_PAGES) {
      expect(within(column).getByRole("link", { name: tool.navLabel })).toHaveAttribute(
        "href",
        tool.path
      );
    }
  });
});
