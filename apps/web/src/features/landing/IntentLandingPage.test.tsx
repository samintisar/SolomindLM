import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { IntentLandingPage } from "./IntentLandingPage";
import { getIntentLandingPageByPath, getRelatedIntentPages } from "./intentLandingPages";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<IntentLandingPage pagePath={path} />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function getPage(path: string) {
  const page = getIntentLandingPageByPath(path);
  if (!page) throw new Error(`No intent page at ${path}`);
  return page;
}

describe("IntentLandingPage", () => {
  const page = getPage("/students/ai-flashcards");

  it("has exactly one h1, with the page's headline", () => {
    renderPage(page.path);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(page.h1);
  });

  it("shows breadcrumbs: Home and Students as links, the tool as the current page", () => {
    renderPage(page.path);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute(
      "href",
      "/students"
    );
    const current = within(nav).getByText(page.navLabel);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });

  it("keeps both source → output captions and every proof point readable", () => {
    renderPage(page.path);
    expect(screen.getByText(page.sourceToOutput.source)).toBeInTheDocument();
    expect(screen.getByText(page.sourceToOutput.output)).toBeInTheDocument();
    for (const bullet of page.proofBullets) {
      expect(screen.getByText(bullet)).toBeInTheDocument();
    }
  });

  it("keeps every FAQ answer in the DOM", () => {
    renderPage(page.path);
    for (const faq of page.faqs) {
      expect(screen.getByText(faq.question)).toBeInTheDocument();
      expect(screen.getByText(faq.answer, { selector: "p" })).toBeInTheDocument();
    }
  });

  it("links to the related tools as cards", () => {
    renderPage(page.path);
    const related = getRelatedIntentPages(page);
    expect(related.length).toBeGreaterThan(0);
    const section = screen.getByRole("region", { name: /explore other study tools/i });
    const hrefs = within(section)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(related.map((p) => p.path));
    for (const relatedPage of related) {
      expect(
        within(section).getByRole("heading", { level: 3, name: relatedPage.navLabel })
      ).toBeInTheDocument();
    }
  });

  it("opens the sign-up modal from the hero's call to action", async () => {
    renderPage(page.path);
    const hero = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement;
    expect(screen.queryByRole("dialog", { name: "Sign up" })).toBeNull();
    await userEvent.click(within(hero).getByRole("button", { name: page.ctaLabel }));
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });

  it("shows the cross-link card when the page has one", () => {
    const quizzes = getPage("/students/ai-quizzes");
    const crossLink = quizzes.heroCrossLink;
    if (!crossLink) throw new Error("Expected /students/ai-quizzes to have a heroCrossLink");
    renderPage(quizzes.path);
    expect(screen.getByText(crossLink.label)).toBeInTheDocument();
    expect(screen.getByText(crossLink.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /written questions with feedback/i })).toHaveAttribute(
      "href",
      crossLink.path
    );
  });

  it("has no cross-link card on a page without one", () => {
    renderPage(page.path);
    expect(screen.queryByRole("link", { name: /written questions with feedback/i })).toBeNull();
  });

  it("redirects an unknown path home", () => {
    renderPage("/students/not-a-tool");
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
