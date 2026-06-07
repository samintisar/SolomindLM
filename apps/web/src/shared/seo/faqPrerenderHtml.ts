import { getFaqCategoriesWithItems } from "@/features/landing/faqRegistry";
import { escapeHtml } from "./seoHtml";

export function buildFaqPrerenderBody(): string {
  const categories = getFaqCategoriesWithItems();

  const sections = categories
    .map((category) => {
      const items = category.faqs
        .map(
          (faq) =>
            `          <div>\n            <h3>${escapeHtml(faq.question)}</h3>\n            <p>${escapeHtml(faq.answer)}</p>\n          </div>`
        )
        .join("\n");

      return `      <section aria-labelledby="seo-faq-${category.id}">\n        <h2 id="seo-faq-${category.id}">${escapeHtml(category.title)}</h2>\n        <p>${escapeHtml(category.description)}</p>\n${items}\n      </section>`;
    })
    .join("\n");

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <h1>Frequently asked questions</h1>
        <p>Answers about SolomindLM study tools, research workflows, pricing, privacy, and getting started.</p>
      </header>
${sections}
      <footer>
        <p><a href="/">SolomindLM home</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
      </footer>
    </article>`;
}
