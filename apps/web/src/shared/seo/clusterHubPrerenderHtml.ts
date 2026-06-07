import {
  type ClusterHubPageConfig,
  resolveHubSectionPages,
} from "@/features/landing/clusterHubPages";
import { escapeHtml } from "./seoHtml";

/** Static HTML body for cluster hub pages — injected at build time into prerendered index.html. */
export function buildClusterHubPrerenderBody(page: ClusterHubPageConfig): string {
  const clusterLabel = page.cluster === "students" ? "For students" : "For researchers";
  const summaryItems = page.summaryBullets
    .map((bullet) => `        <li>${escapeHtml(bullet)}</li>`)
    .join("\n");

  const sectionBlocks = page.sections
    .map((section) => {
      const childPages = resolveHubSectionPages(page, section);
      const childLinks = childPages
        .map(
          (child) =>
            `          <li><a href="${escapeHtml(child.path)}">${escapeHtml(child.navLabel)}</a>: ${escapeHtml(child.subheadline)}</li>`
        )
        .join("\n");
      return `        <section>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.description)}</p>
          <ul>
${childLinks}
          </ul>
        </section>`;
    })
    .join("\n");

  const guideLinks = page.guideLinks
    .map(
      (link) =>
        `          <li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>: ${escapeHtml(link.description)}</li>`
    )
    .join("\n");

  const guideSection =
    page.guideLinks.length > 0
      ? `      <section aria-labelledby="seo-prerender-guides">
        <h2 id="seo-prerender-guides">Guides and comparisons</h2>
        <ul>
${guideLinks}
        </ul>
      </section>`
      : "";

  const faqItems = page.faqs
    .map(
      (faq) =>
        `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
    )
    .join("\n");

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <p>${escapeHtml(clusterLabel)}</p>
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.subheadline)}</p>
      </header>
      <section aria-labelledby="seo-prerender-summary">
        <h2 id="seo-prerender-summary">Overview</h2>
        <ul>
${summaryItems}
        </ul>
      </section>
      <section aria-labelledby="seo-prerender-tools">
        <h2 id="seo-prerender-tools">Tools</h2>
${sectionBlocks}
      </section>
${guideSection}
      <section aria-labelledby="seo-prerender-faq">
        <h2 id="seo-prerender-faq">Frequently asked questions</h2>
${faqItems}
      </section>
      <section>
        <h2>${escapeHtml(page.conversionPromise)}</h2>
        <p>${escapeHtml(page.ctaLabel)}</p>
      </section>
      <footer>
        <p><a href="/">SolomindLM home</a></p>
      </footer>
    </article>`;
}
