import {
  getSeoContentBreadcrumbItems,
  type SeoContentPageConfig,
} from "@/features/landing/seoContentPages";
import { escapeHtml } from "./seoHtml";

/** Static HTML body for crawlers — injected at build time into prerendered index.html. */
export function buildSeoContentPrerenderBody(page: SeoContentPageConfig): string {
  const breadcrumbItems = getSeoContentBreadcrumbItems(page);
  const breadcrumbNav = breadcrumbItems
    .map((item, index) => {
      const isLast = index === breadcrumbItems.length - 1;
      const label = escapeHtml(item.name);
      return isLast
        ? `          <li>${label}</li>`
        : `          <li><a href="${escapeHtml(item.path)}">${label}</a></li>`;
    })
    .join("\n");

  const quickAnswer = page.quickAnswer
    ? `      <section aria-labelledby="seo-prerender-quick-answer">
        <h2 id="seo-prerender-quick-answer">Quick answer</h2>
        ${page.quickAnswer.chooseCompetitor ? `<p><strong>NotebookLM:</strong> ${escapeHtml(page.quickAnswer.chooseCompetitor)}</p>` : ""}
        <p><strong>SolomindLM:</strong> ${escapeHtml(page.quickAnswer.chooseSolomindlm)}</p>
      </section>`
    : "";

  const comparisonTable = page.comparisonTable
    ? `      <section aria-labelledby="seo-prerender-comparison">
        <h2 id="seo-prerender-comparison">Comparison</h2>
        <table>
          <thead>
            <tr><th>Topic</th><th>SolomindLM</th><th>NotebookLM</th></tr>
          </thead>
          <tbody>
${page.comparisonTable
  .map(
    (row) =>
      `            <tr><th scope="row">${escapeHtml(row.topic)}</th><td>${escapeHtml(row.solomindlm)}</td><td>${escapeHtml(row.competitor)}</td></tr>`
  )
  .join("\n")}
          </tbody>
        </table>
      </section>`
    : "";

  const sections = page.sections
    .map((section) => {
      const paragraphs = section.paragraphs
        .map((paragraph) => `        <p>${escapeHtml(paragraph)}</p>`)
        .join("\n");
      const bullets =
        section.bullets && section.bullets.length > 0
          ? `        <ul>\n${section.bullets.map((bullet) => `          <li>${escapeHtml(bullet)}</li>`).join("\n")}\n        </ul>`
          : "";
      return `      <section>\n        <h2>${escapeHtml(section.h2)}</h2>\n${paragraphs}\n${bullets}\n      </section>`;
    })
    .join("\n");

  const faqItems = page.faqs
    .map(
      (faq) =>
        `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
    )
    .join("\n");

  const relatedLinks = page.relatedLinks
    .map(
      (link) =>
        `          <li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a></li>`
    )
    .join("\n");

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <nav aria-label="Breadcrumb">
        <ol>
${breadcrumbNav}
        </ol>
      </nav>
      <header>
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.intro)}</p>
      </header>
${quickAnswer}
${comparisonTable}
${sections}
      <section aria-labelledby="seo-prerender-faq">
        <h2 id="seo-prerender-faq">Frequently asked questions</h2>
${faqItems}
      </section>
      <section aria-labelledby="seo-prerender-related">
        <h2 id="seo-prerender-related">Related pages</h2>
        <ul>
${relatedLinks}
        </ul>
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
