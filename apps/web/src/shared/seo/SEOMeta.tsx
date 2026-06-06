import React, { useEffect } from "react";
import { getPublicSeoPageByPath } from "./publicSeoPages";
import { SEO_BASE_URL, SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_TITLE } from "./seoConstants";
import { canonicalUrl } from "./seoHtml";

interface SEOMetaProps {
  /** Look up title, description, and structured data from the public SEO registry. */
  pagePath?: string;
  title?: string;
  description?: string;
  canonical?: string;
  keywords?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image";
  noindex?: boolean;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

export const SEOMeta: React.FC<SEOMetaProps> = (props) => {
  const registryPage = props.pagePath ? getPublicSeoPageByPath(props.pagePath) : undefined;

  const title = props.title ?? registryPage?.title ?? SEO_DEFAULT_TITLE;
  const description = props.description ?? registryPage?.description ?? SEO_DEFAULT_DESCRIPTION;
  const canonical = props.canonical ?? registryPage?.path;
  const keywords = props.keywords ?? registryPage?.keywords;
  const ogType = props.ogType ?? registryPage?.ogType ?? "website";
  const ogImage = props.ogImage ?? registryPage?.ogImage;
  const ogImageAlt = props.ogImageAlt ?? registryPage?.ogImageAlt;
  const twitterCard = props.twitterCard ?? registryPage?.twitterCard ?? "summary_large_image";
  const noindex = props.noindex ?? registryPage?.noindex ?? false;
  const structuredData = props.structuredData ?? registryPage?.structuredData;

  useEffect(() => {
    document.title = title;

    setMetaTag("name", "description", description);

    if (keywords !== undefined) {
      setMetaTag("name", "keywords", keywords);
    }

    setMetaTag("property", "og:title", title);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:type", ogType);

    const pageUrl = canonical
      ? canonicalUrl(SEO_BASE_URL, canonical)
      : typeof window !== "undefined"
        ? window.location.href
        : SEO_BASE_URL;

    setMetaTag("property", "og:url", pageUrl);

    if (ogImage) {
      setMetaTag("property", "og:image", ogImage);
      if (ogImageAlt) {
        setMetaTag("property", "og:image:alt", ogImageAlt);
      }
    }

    setMetaTag("name", "twitter:card", twitterCard);
    setMetaTag("name", "twitter:title", title);
    setMetaTag("name", "twitter:description", description);
    if (ogImage) {
      setMetaTag("name", "twitter:image", ogImage);
    }

    if (canonical) {
      setLinkTag("canonical", canonicalUrl(SEO_BASE_URL, canonical));
    }

    const robots = noindex ? "noindex, nofollow" : "index, follow";
    setMetaTag("name", "robots", robots);

    if (structuredData) {
      setStructuredData(structuredData);
    }
  }, [
    title,
    description,
    canonical,
    keywords,
    ogType,
    ogImage,
    ogImageAlt,
    twitterCard,
    noindex,
    structuredData,
  ]);

  return null;
};

function setMetaTag(attrName: string, attrValue: string, content: string): void {
  let element = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attrName, attrValue);
    element.setAttribute("data-dynamic", "true");
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setLinkTag(rel: string, href: string): void {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    element.setAttribute("data-dynamic", "true");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

const structuredDataScripts: HTMLScriptElement[] = [];

function removeJsonLdScripts(): void {
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    script.remove();
  });
}

function setStructuredData(data: Record<string, unknown> | Record<string, unknown>[]): void {
  // Prerendered pages ship JSON-LD in index.html; replace it instead of appending a second copy.
  removeJsonLdScripts();
  structuredDataScripts.length = 0;

  const items = Array.isArray(data) ? data : [data];
  items.forEach((item) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(item);
    script.setAttribute("data-dynamic", "true");
    document.head.appendChild(script);
    structuredDataScripts.push(script);
  });
}
