import type { PublicSeoPage } from "./publicSeoPages";
import { SEO_BASE_URL } from "./seoConstants";

export type SeoHeadInput = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image";
  robots: string;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
};

export function canonicalUrl(baseUrl: string, path: string): string {
  if (path === "/") {
    return `${baseUrl}/`;
  }
  return `${baseUrl}${path}`;
}

export function seoPageToHeadInput(page: PublicSeoPage): SeoHeadInput {
  return {
    title: page.title,
    description: page.description,
    canonicalPath: page.path,
    keywords: page.keywords,
    ogType: page.ogType ?? "website",
    ogImage: page.ogImage,
    ogImageAlt: page.ogImageAlt,
    twitterCard: page.twitterCard ?? "summary_large_image",
    robots: page.noindex ? "noindex, nofollow" : "index, follow",
    structuredData: page.structuredData,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

function setMetaContent(
  html: string,
  attrName: "name" | "property",
  attrValue: string,
  content: string
): string {
  const pattern = new RegExp(
    `<meta\\s+${attrName}="${attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*content="[^"]*"[^>]*/?>`,
    "i"
  );
  const replacement = `<meta ${attrName}="${attrValue}" content="${escapeHtml(content)}" data-seo-prerender="true" />`;
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace("</head>", `    ${replacement}\n  </head>`);
}

function setLinkCanonical(html: string, href: string): string {
  const pattern = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i;
  const replacement = `<link rel="canonical" href="${escapeHtml(href)}" data-seo-prerender="true" />`;
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace("</head>", `    ${replacement}\n  </head>`);
}

function removePrerenderJsonLd(html: string): string {
  return html.replace(
    /\s*<script[^>]*type="application\/ld\+json"[^>]*data-seo-prerender="true"[^>]*>[\s\S]*?<\/script>/gi,
    ""
  );
}

function buildJsonLdScripts(data: Record<string, unknown> | Record<string, unknown>[]): string {
  const items = Array.isArray(data) ? data : [data];
  return items
    .map(
      (item) =>
        `    <script type="application/ld+json" data-seo-prerender="true">${JSON.stringify(item)}</script>`
    )
    .join("\n");
}

/** Inject or replace SEO tags in a built index.html template. */
export function applySeoToHtml(
  html: string,
  baseUrl: string = SEO_BASE_URL,
  seo: SeoHeadInput
): string {
  const url = canonicalUrl(baseUrl, seo.canonicalPath);
  let out = html;

  out = replaceTitle(out, seo.title);
  out = setMetaContent(out, "name", "title", seo.title);
  out = setMetaContent(out, "name", "description", seo.description);

  if (seo.keywords) {
    out = setMetaContent(out, "name", "keywords", seo.keywords);
  }

  out = setMetaContent(out, "property", "og:type", seo.ogType ?? "website");
  out = setMetaContent(out, "property", "og:url", url);
  out = setMetaContent(out, "property", "og:title", seo.title);
  out = setMetaContent(out, "property", "og:description", seo.description);

  if (seo.ogImage) {
    out = setMetaContent(out, "property", "og:image", seo.ogImage);
    if (seo.ogImageAlt) {
      out = setMetaContent(out, "property", "og:image:alt", seo.ogImageAlt);
    }
  }

  out = setMetaContent(out, "name", "twitter:card", seo.twitterCard ?? "summary_large_image");
  out = setMetaContent(out, "name", "twitter:url", url);
  out = setMetaContent(out, "name", "twitter:title", seo.title);
  out = setMetaContent(out, "name", "twitter:description", seo.description);

  if (seo.ogImage) {
    out = setMetaContent(out, "name", "twitter:image", seo.ogImage);
  }

  out = setLinkCanonical(out, url);
  out = setMetaContent(out, "name", "robots", seo.robots);
  out = setMetaContent(out, "name", "googlebot", seo.robots);

  out = removePrerenderJsonLd(out);

  if (seo.structuredData) {
    const scripts = buildJsonLdScripts(seo.structuredData);
    out = out.replace("</head>", `${scripts}\n  </head>`);
  }

  return out;
}
