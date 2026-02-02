import React, { useEffect } from 'react';

interface SEOMetaProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  noindex?: boolean;
  structuredData?: Record<string, unknown>;
}

const BASE_URL = 'https://solomindlm.com';
const DEFAULT_TITLE = 'SolomindLM - AI Research Tool & Learning Partner';
const DEFAULT_DESCRIPTION = 'Transform PDFs, videos, and articles into flashcards, quizzes, mind maps, and audio overviews. Grounded AI ensures accurate, hallucination-free study materials.';

export const SEOMeta: React.FC<SEOMetaProps> = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonical,
  ogType = 'website',
  ogImage,
  ogImageAlt,
  twitterCard = 'summary_large_image',
  noindex = false,
  structuredData,
}) => {
  useEffect(() => {
    // Update basic meta tags
    document.title = title;

    // Update or create meta description
    setMetaTag('name', 'description', description);

    // Open Graph tags
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:url', window.location.href);

    if (ogImage) {
      setMetaTag('property', 'og:image', ogImage);
      if (ogImageAlt) {
        setMetaTag('property', 'og:image:alt', ogImageAlt);
      }
    }

    // Twitter Card tags
    setMetaTag('name', 'twitter:card', twitterCard);
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', description);
    if (ogImage) {
      setMetaTag('name', 'twitter:image', ogImage);
    }

    // Canonical link
    if (canonical) {
      setLinkTag('canonical', `${BASE_URL}${canonical}`);
    } else {
      setLinkTag('canonical', window.location.href);
    }

    // Robots meta
    if (noindex) {
      setMetaTag('name', 'robots', 'noindex, nofollow');
    } else {
      setMetaTag('name', 'robots', 'index, follow');
    }

    // Structured data (JSON-LD)
    if (structuredData) {
      setStructuredData(structuredData);
    }

    // Cleanup on unmount
    return () => {
      removeMetaTags();
    };
  }, [title, description, canonical, ogType, ogImage, ogImageAlt, twitterCard, noindex, structuredData]);

  return null; // This component doesn't render anything
};

// Helper functions
function setMetaTag(attrName: string, attrValue: string, content: string): void {
  let element = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setLinkTag(rel: string, href: string): void {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

let structuredDataElement: HTMLScriptElement | null = null;

function setStructuredData(data: Record<string, unknown>): void {
  if (!structuredDataElement) {
    structuredDataElement = document.createElement('script');
    structuredDataElement.type = 'application/ld+json';
    document.head.appendChild(structuredDataElement);
  }
  structuredDataElement.textContent = JSON.stringify(data);
}

function removeMetaTags(): void {
  // Remove dynamically created meta tags on cleanup
  const dynamicMetaTags = document.querySelectorAll('meta[data-dynamic="true"]');
  dynamicMetaTags.forEach(tag => tag.remove());

  // Remove structured data
  if (structuredDataElement && structuredDataElement.parentNode) {
    structuredDataElement.parentNode.removeChild(structuredDataElement);
    structuredDataElement = null;
  }
}

// Predefined structured data generators
export const generateFAQStructuredData = (faqs: Array<{ question: string; answer: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
});

export const generateOrganizationStructuredData = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'SolomindLM',
  url: BASE_URL,
  logo: `${BASE_URL}/SolomindLM_logo.png`,
  description: DEFAULT_DESCRIPTION,
  sameAs: [
    'https://github.com/solomindlm',
    'https://twitter.com/solomindlm',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@solomindlm.com',
  },
});

export const generateWebSiteStructuredData = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SolomindLM',
  url: BASE_URL,
  description: DEFAULT_DESCRIPTION,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${BASE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
});
