import type { PublicSeoPage } from "./publicSeoPages";
import { SEO_BASE_URL } from "./seoConstants";
import { canonicalUrl } from "./seoHtml";

/**
 * sitemap.xml for the given pages. A page without a registry `lastmod` gets no `<lastmod>`: a
 * build date would claim the page changed on every deploy, and IndexNow diffs these dates.
 */
export function buildSitemapXml(pages: PublicSeoPage[]): string {
  const urls = pages
    .map((page) => {
      const loc = canonicalUrl(SEO_BASE_URL, page.path);
      const lastmod = page.lastmod ? `\n    <lastmod>${page.lastmod}</lastmod>` : "";
      const changefreq = page.changefreq ?? "monthly";
      const priority = page.priority ?? 0.5;
      return `  <url>
    <loc>${loc}</loc>${lastmod}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
    })
    .join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
