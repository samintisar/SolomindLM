import type { IntentLandingPageConfig } from "@/features/landing/intentLandingPages";
import { escapeHtml } from "./seoHtml";

/** Static HTML body for crawlers — injected at build time into prerendered index.html. */
export function buildIntentLandingPrerenderBody(page: IntentLandingPageConfig): string {
  const clusterLabel = page.cluster === "students" ? "For students" : "For researchers";
  const proofItems = page.proofBullets
    .map((bullet) => `        <li>${escapeHtml(bullet)}</li>`)
    .join("\n");
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
      <section aria-labelledby="seo-prerender-highlights">
        <h2 id="seo-prerender-highlights">Why SolomindLM</h2>
        <ul>
${proofItems}
        </ul>
      </section>
      <section aria-labelledby="seo-prerender-workflow">
        <h2 id="seo-prerender-workflow">Example workflow</h2>
        <p><strong>Source:</strong> ${escapeHtml(page.sourceToOutput.source)}</p>
        <p><strong>Output:</strong> ${escapeHtml(page.sourceToOutput.output)}</p>
      </section>
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
