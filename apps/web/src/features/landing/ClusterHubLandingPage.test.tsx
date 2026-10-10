import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ClusterHubLandingPage } from "./ClusterHubLandingPage";
import {
  getClusterHubLastUpdated,
  getClusterHubPageByPath,
  resolveHubSectionPages,
} from "./clusterHubPages";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign up" /> : null,
}));
vi.mock("@/shared/seo/SEOMeta", () => ({ SEOMeta: () => null }));
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => false }));

function renderHub(pagePath: string) {
  return render(
    <MemoryRouter initialEntries={[pagePath]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="*" element={<ClusterHubLandingPage pagePath={pagePath} />} />
      </Routes>
    </MemoryRouter>
  );
}

function hub(path: string) {
  const page = getClusterHubPageByPath(path);
  if (!page) throw new Error(`no hub at ${path}`);
  return page;
}

/** The hero block around the h1 (the footer also links "For students"). */
function heroOf(h1: HTMLElement) {
  const hero = h1.parentElement;
  if (!hero) throw new Error("h1 has no parent");
  return hero;
}

/** The single link in `scope` pointing at `path`. */
function linkTo(scope: HTMLElement, path: string) {
  const links = within(scope)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href") === path);
  expect(links).toHaveLength(1);
  return links[0];
}

describe("ClusterHubLandingPage", () => {
  const students = hub("/students");

  it("has one h1, the cluster eyebrow and no breadcrumbs", () => {
    renderHub("/students");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(students.h1);
    expect(heroOf(h1s[0])).toHaveTextContent("For students");
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("shows the hub's last-updated date in the hero", () => {
    renderHub("/students");
    const time = heroOf(screen.getByRole("heading", { level: 1 })).querySelector("time");
    expect(time).toHaveAttribute("datetime", getClusterHubLastUpdated(students));
  });

  it("numbers each tool group, counts its tools and links a card per tool", () => {
    renderHub("/students");
    const tools = screen.getByRole("region", { name: "Study tools" });
    const groups = students.sections
      .map((section) => ({ section, pages: resolveHubSectionPages(students, section) }))
      .filter(({ pages }) => pages.length > 0);
    expect(groups.length).toBeGreaterThan(0);

    groups.forEach(({ section, pages }, index) => {
      expect(
        within(tools).getByRole("heading", { level: 3, name: `${index + 1} · ${section.title}` })
      ).toBeInTheDocument();
      expect(within(tools).getByText(`${pages.length} tools`)).toBeInTheDocument();
      for (const child of pages) {
        const card = linkTo(tools, child.path);
        expect(
          within(card).getByRole("heading", { level: 4, name: child.navLabel })
        ).toBeInTheDocument();
        expect(within(card).getByText(child.cardBlurb)).toBeInTheDocument();
      }
    });
  });

  it("shows every summary bullet", () => {
    renderHub("/students");
    for (const bullet of students.summaryBullets) {
      expect(screen.getByText(bullet)).toBeInTheDocument();
    }
  });

  it("links a card per guide", () => {
    renderHub("/students");
    const guides = screen.getByRole("region", { name: "Guides and comparisons" });
    for (const guide of students.guideLinks) {
      const card = linkTo(guides, guide.path);
      expect(
        within(card).getByRole("heading", { level: 3, name: guide.label })
      ).toBeInTheDocument();
      expect(within(card).getByText(guide.description)).toBeInTheDocument();
    }
  });

  it("keeps every FAQ answer in the DOM", () => {
    renderHub("/students");
    for (const faq of students.faqs) {
      expect(screen.getByText(faq.answer)).toBeInTheDocument();
    }
  });

  it("opens the sign-up dialog from the hero CTA", async () => {
    renderHub("/students");
    expect(screen.queryByRole("dialog", { name: "Sign up" })).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: students.ctaLabel })[0]);
    expect(screen.getByRole("dialog", { name: "Sign up" })).toBeInTheDocument();
  });

  it("labels the research hub for researchers", () => {
    renderHub("/research");
    expect(heroOf(screen.getByRole("heading", { level: 1 }))).toHaveTextContent("For researchers");
    expect(screen.getByRole("region", { name: "Research tools" })).toBeInTheDocument();
  });

  it("redirects an unknown path home", () => {
    renderHub("/nope");
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
