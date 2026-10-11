import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FREE_TOOL_PAGES,
  PDF_TO_FLASHCARDS_PAGE,
  type ToolPageConfig,
} from "@/features/tools/toolPages";
import {
  TOOLS_HUB_LAST_UPDATED,
  TOOLS_HUB_PAGE,
  TOOLS_HUB_PATH,
} from "@/features/tools/toolsHubPage";
import { getIndexablePublicSeoPages, getPublicSeoPageByPath } from "./publicSeoPages";
import { buildHomePrerenderBody, buildPublicSeoPrerenderBody } from "./publicSeoPrerenderHtml";
import { SEO_BASE_URL } from "./seoConstants";
import { buildSitemapXml } from "./sitemapXml";
import {
  buildPrerenderFreeToolsNavHtml,
  buildToolsHubPrerenderBody,
} from "./toolsHubPrerenderHtml";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readPublic = (file: string) => readFileSync(path.join(webRoot, "public", file), "utf-8");

function jsonLdNodes(pagePath: string): Record<string, unknown>[] {
  const page = getPublicSeoPageByPath(pagePath);
  if (!page) throw new Error(`No SEO page at ${pagePath}`);
  return (
    Array.isArray(page.structuredData) ? page.structuredData : [page.structuredData]
  ) as Record<string, unknown>[];
}

function jsonLdNode(pagePath: string, type: string): Record<string, unknown> {
  const node = jsonLdNodes(pagePath).find((item) => item["@type"] === type);
  if (!node) throw new Error(`No ${type} JSON-LD on ${pagePath}`);
  return node;
}

/** Runs `check` with an extra tool appended to the registry, then removes it. */
function withExtraTool(check: (tool: ToolPageConfig) => void) {
  const tool: ToolPageConfig = {
    ...PDF_TO_FLASHCARDS_PAGE,
    path: "/tools/test-only-tool",
    navLabel: "Test-only tool",
    h1: "Test-only Free Tool",
    description: "A tool that exists only in this test.",
  };
  FREE_TOOL_PAGES.push(tool);
  try {
    check(tool);
  } finally {
    FREE_TOOL_PAGES.pop();
  }
}

describe("/tools hub registration", () => {
  it("is an indexable page, so it is in sitemap.xml and the IndexNow URL list", () => {
    const page = getIndexablePublicSeoPages().find((item) => item.path === TOOLS_HUB_PATH);
    expect(page).toMatchObject({ title: TOOLS_HUB_PAGE.title, lastmod: TOOLS_HUB_LAST_UPDATED });
    expect(buildSitemapXml(getIndexablePublicSeoPages())).toContain(
      `<loc>${SEO_BASE_URL}${TOOLS_HUB_PATH}</loc>`
    );
  });

  it("has BreadcrumbList, CollectionPage/ItemList and FAQPage JSON-LD", () => {
    expect(jsonLdNode(TOOLS_HUB_PATH, "BreadcrumbList")).toMatchObject({
      itemListElement: [
        { position: 1, name: "Home", item: SEO_BASE_URL },
        { position: 2, name: "Free tools", item: `${SEO_BASE_URL}/tools` },
      ],
    });

    const collection = jsonLdNode(TOOLS_HUB_PATH, "CollectionPage");
    expect(collection).toMatchObject({
      url: `${SEO_BASE_URL}/tools`,
      dateModified: TOOLS_HUB_LAST_UPDATED,
      mainEntity: { "@type": "ItemList", numberOfItems: FREE_TOOL_PAGES.length },
    });
    const items = (collection.mainEntity as { itemListElement: Record<string, unknown>[] })
      .itemListElement;
    expect(items).toEqual(
      FREE_TOOL_PAGES.map((tool, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: tool.h1,
        url: `${SEO_BASE_URL}${tool.path}`,
      }))
    );

    expect(jsonLdNode(TOOLS_HUB_PATH, "FAQPage")).toMatchObject({
      dateModified: TOOLS_HUB_LAST_UPDATED,
    });
  });

  it("puts the hub in each tool's breadcrumb trail", () => {
    for (const tool of FREE_TOOL_PAGES) {
      const trail = jsonLdNode(tool.path, "BreadcrumbList").itemListElement as {
        name: string;
        item: string;
      }[];
      expect(trail.map((crumb) => crumb.item)).toEqual([
        SEO_BASE_URL,
        `${SEO_BASE_URL}/tools`,
        `${SEO_BASE_URL}${tool.path}`,
      ]);
    }
  });

  it.each(["llms.txt", "llms-full.txt"])("%s links the hub", (file) => {
    expect(readPublic(file)).toContain(`${SEO_BASE_URL}/tools\n`);
  });
});

describe("/tools hub prerender", () => {
  const body = buildPublicSeoPrerenderBody(TOOLS_HUB_PATH);

  it("prerenders the hub light-pinned, with its h1, breadcrumb and visible updated date", () => {
    expect(body).toContain('class="auth-form-light');
    expect(body).toContain(`<h1>${TOOLS_HUB_PAGE.h1}</h1>`);
    expect(body).toContain('<li><a href="/">Home</a></li>');
    expect(body).toContain(`Updated <time datetime="${TOOLS_HUB_LAST_UPDATED}">`);
    expect(body).toContain(TOOLS_HUB_PAGE.faqs[0]!.question);
  });

  it("links every registered tool", () => {
    for (const tool of FREE_TOOL_PAGES) {
      expect(body).toContain(`<a href="${tool.path}">${tool.h1}</a>`);
    }
  });

  it("lists a tool added to the registry with no other change", () => {
    withExtraTool((tool) => {
      expect(buildToolsHubPrerenderBody()).toContain(`<a href="${tool.path}">${tool.h1}</a>`);
      expect(buildPrerenderFreeToolsNavHtml()).toContain(
        `<a href="${tool.path}">${tool.navLabel}</a>`
      );
      expect(buildHomePrerenderBody()).toContain(`<a href="${tool.path}">${tool.h1}</a>`);
    });
  });
});

describe("links to the free tools across the prerendered site", () => {
  it("the homepage body links the hub and each tool", () => {
    const home = buildHomePrerenderBody();
    expect(home).toContain(`<a href="${TOOLS_HUB_PATH}">`);
    for (const tool of FREE_TOOL_PAGES) {
      expect(home).toContain(`<a href="${tool.path}">${tool.h1}</a>`);
    }
  });

  it("every prerendered page's footer links the hub and each tool", () => {
    const pages = getIndexablePublicSeoPages();
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const body = buildPublicSeoPrerenderBody(page.path);
      expect(body, page.path).toBeDefined();
      const footer = body!.slice(body!.lastIndexOf("<footer>"));
      expect(footer, page.path).toContain(`<a href="${TOOLS_HUB_PATH}">Free tools</a>`);
      for (const tool of FREE_TOOL_PAGES) {
        expect(footer, page.path).toContain(`<a href="${tool.path}">${tool.navLabel}</a>`);
      }
    }
  });
});
