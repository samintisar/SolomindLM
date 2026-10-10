import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PageHero } from "./PageHero";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "For students", path: "/for-students" },
  { name: "AI flashcards", path: "/ai-flashcards" },
];

function renderHero(props: Partial<Parameters<typeof PageHero>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PageHero title="Make AI flashcards" lede="From your own PDF." {...props} />
    </MemoryRouter>
  );
}

describe("PageHero", () => {
  it("renders breadcrumbs: earlier items are links, the last is the current page", () => {
    renderHero({ breadcrumbs: CRUMBS });
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(items[1]).getByRole("link", { name: "For students" })).toHaveAttribute(
      "href",
      "/for-students"
    );
    const current = within(items[2]).getByText("AI flashcards");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(items[2]).queryByRole("link")).toBeNull();
  });

  it("renders the eyebrow and no breadcrumb nav", () => {
    renderHero({ eyebrow: "For students" });
    expect(screen.getByText("For students")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("renders one h1 with the title", () => {
    renderHero({ titleAccent: "flashcards" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Make AI flashcards");
  });

  it("renders the CTA button and the fine print", async () => {
    const onClick = vi.fn();
    renderHero({ cta: { label: "Make flashcards", onClick } });
    await userEvent.click(screen.getByRole("button", { name: "Make flashcards" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Free plan, no card")).toBeInTheDocument();
  });

  it("renders the updated date as a machine-readable <time>", () => {
    renderHero({ updated: "2026-10-07" });
    const time = screen.getByText("October 7, 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-10-07");
    expect(time.parentElement).toHaveTextContent("Updated October 7, 2026");
  });

  it("renders no date without `updated`", () => {
    renderHero();
    expect(document.querySelector("time")).toBeNull();
  });

  it("renders no button without a CTA", () => {
    renderHero();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
