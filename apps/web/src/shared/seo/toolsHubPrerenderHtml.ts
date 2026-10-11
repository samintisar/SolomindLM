import { FREE_TOOL_PAGES } from "@/features/tools/toolPages";
import {
  getToolsHubBreadcrumbItems,
  getToolsHubLinks,
  TOOLS_HUB_LAST_UPDATED,
  TOOLS_HUB_PAGE,
  TOOLS_HUB_PATH,
} from "@/features/tools/toolsHubPage";
import { buildUpdatedLineHtml } from "./seoDates";
import { escapeHtml } from "./seoHtml";

/**
 * The free-tools line in every prerendered page's footer: the /tools hub and each registered tool.
 * The React pages link the same set from the site footer, which crawlers reading the static HTML
 * never see.
 */
export function buildPrerenderFreeToolsNavHtml(): string {
  const toolLinks = FREE_TOOL_PAGES.map(
    (tool) => `<a href="${escapeHtml(tool.path)}">${escapeHtml(tool.navLabel)}</a>`
  ).join(" · ");
  return `        <nav aria-label="${escapeHtml(TOOLS_HUB_PAGE.navLabel)}">
          <p><a href="${TOOLS_HUB_PATH}">${escapeHtml(TOOLS_HUB_PAGE.navLabel)}</a>: ${toolLinks}</p>
        </nav>`;
}

/** Static HTML body for the /tools hub — injected at build time into prerendered index.html. */
export function buildToolsHubPrerenderBody(): string {
  const breadcrumbItems = getToolsHubBreadcrumbItems();
  const breadcrumbNav = breadcrumbItems
    .map((item, index) => {
      const label = escapeHtml(item.name);
      return index === breadcrumbItems.length - 1
        ? `          <li>${label}</li>`
        : `          <li><a href="${escapeHtml(item.path)}">${label}</a></li>`;
    })
    .join("\n");

  const toolItems = getToolsHubLinks()
    .map(
      (link) =>
        `          <li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>: ${escapeHtml(link.description)}</li>`
    )
    .join("\n");

  const faqItems = TOOLS_HUB_PAGE.faqs
    .map(
      (faq) =>
        `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
    )
    .join("\n");

  return `    <main>\n      <article data-seo-prerender="true" id="seo-prerender-content">
      <nav aria-label="Breadcrumb">
        <ol>
${breadcrumbNav}
        </ol>
      </nav>
      <header>
        <h1>${escapeHtml(TOOLS_HUB_PAGE.h1)}</h1>
        <p>${escapeHtml(TOOLS_HUB_PAGE.intro)}</p>
        ${buildUpdatedLineHtml(TOOLS_HUB_LAST_UPDATED)}
      </header>
      <section aria-labelledby="seo-prerender-tools">
        <h2 id="seo-prerender-tools">Tools</h2>
        <ul>
${toolItems}
        </ul>
      </section>
      <section aria-labelledby="seo-prerender-faq">
        <h2 id="seo-prerender-faq">Frequently asked questions</h2>
${faqItems}
      </section>
      <section>
        <h2>${escapeHtml(TOOLS_HUB_PAGE.conversionPromise)}</h2>
        <p>${escapeHtml(TOOLS_HUB_PAGE.ctaLabel)}</p>
      </section>
      <footer>
        <p><a href="/">SolomindLM home</a></p>
${buildPrerenderFreeToolsNavHtml()}
      </footer>
      </article>\n    </main>`;
}
