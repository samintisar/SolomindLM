import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SeoContentPage } from "./SeoContentPage";
import { getSeoContentLastUpdated, getSeoContentPageByPath } from "./seoContentPages";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderPage(pagePath: string) {
  return render(
    <MemoryRouter initialEntries={[pagePath]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="*" element={<SeoContentPage pagePath={pagePath} />} />
      </Routes>
    </MemoryRouter>
  );
}

function seoPage(path: string) {
  const page = getSeoContentPageByPath(path);
  if (!page) throw new Error(`no SEO page at ${path}`);
  return page;
}

/** The section labelled by the heading with this id. */
function sectionLabelledBy(id: string) {
  const section = document.querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`);
  if (!section) throw new Error(`no section labelled by #${id}`);
  return section;
}

/** The hero block around the h1. */
function heroOf(h1: HTMLElement) {
  const hero = h1.parentElement;
  if (!hero) throw new Error("h1 has no parent");
  return hero;
}

describe("SeoContentPage: comparison", () => {
  const path = "/compare/solomindlm-vs-elicit";
  const page = seoPage(path);
  const quickAnswer = page.quickAnswer;
  const rows = page.comparisonTable;
  if (!quickAnswer?.chooseCompetitor || !rows || !page.sources) {
    throw new Error("the Elicit page needs a quick answer, a table and sources");
  }

  it("has one h1 and a Home › Compare › page breadcrumb trail", () => {
    renderPage(path);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(page.h1);

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    const items = within(trail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Home", "Compare", page.navLabel]);
    expect(within(trail).getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      "/compare"
    );
  });

  it("puts the sign-up button in the quick answer, not the hero", async () => {
    renderPage(path);
    expect(within(heroOf(screen.getByRole("heading", { level: 1 }))).queryByRole("button")).toBe(
      null
    );

    const answer = sectionLabelledBy("quick-answer-title");
    const cardTitles = within(answer).getAllByRole("heading", { level: 3 });
    expect(cardTitles.map((title) => title.textContent)).toEqual([
      `Choose ${page.competitorName} if…`,
      "Choose SolomindLM if…",
    ]);
    const [theirs, ours] = cardTitles.map((title) => title.closest("[data-slot=card]"));
    expect(theirs).toHaveTextContent(quickAnswer.chooseCompetitor ?? "");
    expect(ours).toHaveAttribute("data-variant", "featured");
    expect(ours).toHaveTextContent(quickAnswer.chooseSolomindlm);

    // The quick answer and the closing section carry the only sign-up buttons on the page.
    expect(screen.getAllByRole("button", { name: page.ctaLabel })).toHaveLength(2);
    expect(screen.queryByRole("dialog", { name: "Sign up" })).toBeNull();
    await userEvent.click(within(ours as HTMLElement).getByRole("button", { name: page.ctaLabel }));
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });

  it("renders the comparison table with row headers and our column highlighted", () => {
    renderPage(path);
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Topic",
      "SolomindLM",
      page.competitorName,
    ]);
    expect(headers[1]).toHaveClass("from-link/8");
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((header) => header.textContent)
    ).toEqual(rows.map((row) => row.topic));

    const highlighted = [...table.querySelectorAll("td")].filter((cell) =>
      cell.classList.contains("from-link/5")
    );
    expect(highlighted.map((cell) => cell.textContent)).toEqual(rows.map((row) => row.solomindlm));
  });

  it("names the sources the competitor details were checked against", () => {
    renderPage(path);
    const line = screen.getByText(/details checked/);
    const links = within(line).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      page.sources?.map((source) => source.url)
    );
  });

  it("renders every section, the FAQ answers and the related links", () => {
    renderPage(path);
    for (const section of page.sections) {
      expect(screen.getByRole("heading", { level: 2, name: section.h2 })).toBeInTheDocument();
    }
    for (const faq of page.faqs) {
      expect(screen.getByText(faq.answer)).toBeInTheDocument();
    }
    const related = sectionLabelledBy("related-title");
    for (const link of page.relatedLinks) {
      expect(within(related).getByRole("link", { name: new RegExp(link.label) })).toHaveAttribute(
        "href",
        link.path
      );
    }
  });
});

describe("SeoContentPage: guide", () => {
  const path = "/guides/how-to-study-from-pdfs-with-ai";
  const page = seoPage(path);

  it("has a hero button, the article and no quick answer or table", async () => {
    renderPage(path);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.querySelector('[aria-labelledby="quick-answer-title"]')).toBeNull();
    for (const section of page.sections) {
      expect(screen.getByRole("heading", { level: 2, name: section.h2 })).toBeInTheDocument();
    }

    const hero = heroOf(screen.getByRole("heading", { level: 1 }));
    await userEvent.click(within(hero).getByRole("button", { name: page.ctaLabel }));
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });

  it("shows the date the article JSON-LD gives as dateModified", () => {
    renderPage(path);
    const hero = heroOf(screen.getByRole("heading", { level: 1 }));
    const time = hero.querySelector("time");
    expect(time).toHaveAttribute("datetime", getSeoContentLastUpdated(page));
    expect(time?.parentElement).toHaveTextContent(/^Updated [A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });
});

describe("SeoContentPage: compare hub", () => {
  it("renders with no table", () => {
    const page = seoPage("/compare");
    renderPage("/compare");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(page.h1);
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("SeoContentPage: unknown path", () => {
  it("redirects home", () => {
    renderPage("/compare/nope");
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
