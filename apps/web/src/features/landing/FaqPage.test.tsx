import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FaqPage } from "./FaqPage";
import { getFaqCategoriesWithItems } from "./faqRegistry";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/faq"]}>
      <FaqPage />
    </MemoryRouter>
  );
}

describe("FaqPage", () => {
  const categories = getFaqCategoriesWithItems();

  it("has one h1 with the accented word, and the Help center eyebrow", () => {
    renderPage();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1).toHaveTextContent("Frequently asked questions");
    expect(within(h1).getByText("questions").tagName).toBe("EM");
    expect(screen.getByText("Help center")).toBeInTheDocument();
  });

  it("lists one topic link per category, pointing at its anchor", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "FAQ topics" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(categories.length);
    for (const category of categories) {
      expect(within(nav).getByRole("link", { name: category.title })).toHaveAttribute(
        "href",
        `#${category.id}`
      );
    }
  });

  it("puts each category's title (h2) inside its anchored block", () => {
    const { container } = renderPage();
    for (const category of categories) {
      const block = container.querySelector<HTMLElement>(`#${category.id}`);
      expect(block).not.toBeNull();
      expect(
        within(block as HTMLElement).getByRole("heading", { level: 2, name: category.title })
      ).toBeInTheDocument();
    }
  });

  it("keeps every answer and learn-more link in the DOM", () => {
    const { container } = renderPage();
    for (const category of categories) {
      for (const faq of category.faqs) {
        expect(screen.getAllByText(faq.question).length).toBeGreaterThan(0);
        expect(screen.getAllByText(faq.answer, { selector: "p" }).length).toBeGreaterThan(0);
        if (faq.learnMorePath && faq.learnMoreLabel) {
          const links = Array.from(container.querySelectorAll("a")).filter(
            (a) =>
              a.getAttribute("href") === faq.learnMorePath &&
              a.textContent?.includes(faq.learnMoreLabel as string)
          );
          expect(links.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("starts with every row closed", () => {
    const { container } = renderPage();
    const triggers = container.querySelectorAll("main section [aria-expanded]");
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("has no hero button; the closing section's button opens the sign-up dialog", async () => {
    const { container } = renderPage();
    const hero = container.querySelector("h1")?.closest("section") as HTMLElement;
    expect(within(hero).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Sign up" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Create free account/ }));
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });
});
