import { LANDING_FAQS } from "@/features/landing/constants";
import { getIntentLandingPageByPath } from "@/features/landing/intentLandingPages";
import { LEGAL_LAST_UPDATED } from "@/features/legal/legalMeta";
import { buildIntentLandingPrerenderBody } from "./intentLandingPrerenderHtml";
import { SEO_DEFAULT_DESCRIPTION } from "./seoConstants";
import { escapeHtml } from "./seoHtml";

/** Static HTML body for crawlers — injected at build time into prerendered index.html. */
export function buildHomePrerenderBody(): string {
  const faqItems = LANDING_FAQS.map(
    (faq) =>
      `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
  ).join("\n");

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <h1>Learn Anything</h1>
        <p>AI that enhances learning, not replaces thinking.</p>
        <p>${escapeHtml(SEO_DEFAULT_DESCRIPTION)}</p>
      </header>
      <section aria-labelledby="seo-prerender-faq">
        <h2 id="seo-prerender-faq">Frequently asked questions</h2>
${faqItems}
      </section>
      <footer>
        <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
      </footer>
    </article>`;
}

export function buildLegalPrerenderBody(title: string, path: "/privacy" | "/terms"): string {
  const other =
    path === "/terms"
      ? { href: "/privacy", label: "Privacy Policy" }
      : { href: "/terms", label: "Terms of Service" };

  const summary =
    path === "/privacy"
      ? "How SolomindLM collects, uses, and shares information when you use notebooks, sources, AI features, and billing."
      : "Terms that apply when you use SolomindLM's AI research notebooks, sources, chat, and study tools.";

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <p>Legal</p>
        <h1>${escapeHtml(title)}</h1>
        <p>Last updated: ${escapeHtml(LEGAL_LAST_UPDATED)}</p>
        <p>${escapeHtml(summary)}</p>
      </header>
      <footer>
        <p><a href="/">SolomindLM home</a> · <a href="${other.href}">${escapeHtml(other.label)}</a></p>
      </footer>
    </article>`;
}

/** Returns prerender body HTML for indexable public SEO pages, or undefined if not needed. */
export function buildPublicSeoPrerenderBody(path: string): string | undefined {
  if (path === "/") {
    return buildHomePrerenderBody();
  }
  if (path === "/privacy") {
    return buildLegalPrerenderBody("Privacy Policy", "/privacy");
  }
  if (path === "/terms") {
    return buildLegalPrerenderBody("Terms of Service", "/terms");
  }

  const intentPage = getIntentLandingPageByPath(path);
  if (intentPage) {
    return buildIntentLandingPrerenderBody(intentPage);
  }

  return undefined;
}
