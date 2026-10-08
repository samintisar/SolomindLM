import type { ToolPageConfig } from "@/features/tools/toolPages";
import { escapeHtml } from "./seoHtml";

/** Static crawler body for a free tool page: H1, steps, sections, FAQ and related links. */
export function buildToolPrerenderBody(page: ToolPageConfig): string {
  const steps = page.steps
    .map(
      (step) =>
        `          <li><strong>${escapeHtml(step.name)}.</strong> ${escapeHtml(step.text)}</li>`
    )
    .join("\n");
  const sections = page.sections
    .map(
      (section) =>
        `      <section>\n        <h2>${escapeHtml(section.heading)}</h2>\n${section.paragraphs
          .map((p) => `        <p>${escapeHtml(p)}</p>`)
          .join("\n")}\n      </section>`
    )
    .join("\n");
  const faqs = page.faqs
    .map(
      (faq) =>
        `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
    )
    .join("\n");
  const related = page.related
    .map((link) => `          <li><a href="${link.path}">${escapeHtml(link.label)}</a></li>`)
    .join("\n");

  return `    <main>\n      <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.intro)}</p>
      </header>
      <section aria-labelledby="seo-tool-steps">
        <h2 id="seo-tool-steps">How it works</h2>
        <ol>
${steps}
        </ol>
      </section>
${sections}
      <section aria-labelledby="seo-tool-faq">
        <h2 id="seo-tool-faq">Frequently asked questions</h2>
${faqs}
      </section>
      <section aria-labelledby="seo-tool-related">
        <h2 id="seo-tool-related">Related</h2>
        <ul>
${related}
        </ul>
      </section>
      <footer>
        <p><a href="/">SolomindLM home</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
      </footer>
      </article>\n    </main>`;
}
