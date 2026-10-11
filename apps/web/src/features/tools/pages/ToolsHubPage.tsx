import { ContentFaq } from "@/features/landing/components/content/ContentFaq";
import { LinkCard } from "@/features/landing/components/content/LinkCard";
import { MarketingPage } from "@/features/landing/components/content/MarketingPage";
import { PageHero } from "@/features/landing/components/content/PageHero";
import { Stage } from "@/features/landing/components/content/Stage";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import {
  getToolsHubBreadcrumbItems,
  getToolsHubLinks,
  TOOLS_HUB_LAST_UPDATED,
  TOOLS_HUB_PAGE,
} from "../toolsHubPage";

/** The /tools hub: one card per registered free tool, then the FAQ. */
export function ToolsHubPage() {
  const tools = getToolsHubLinks();

  return (
    <>
      <SEOMeta
        pagePath={TOOLS_HUB_PAGE.path}
        title={TOOLS_HUB_PAGE.title}
        description={TOOLS_HUB_PAGE.description}
        keywords={TOOLS_HUB_PAGE.keywords}
      />
      <MarketingPage
        closing={{ body: TOOLS_HUB_PAGE.conversionPromise, ctaLabel: TOOLS_HUB_PAGE.ctaLabel }}
      >
        {() => (
          <>
            <PageHero
              breadcrumbs={getToolsHubBreadcrumbItems()}
              title={TOOLS_HUB_PAGE.h1}
              titleAccent={TOOLS_HUB_PAGE.h1Accent}
              lede={TOOLS_HUB_PAGE.intro}
              updated={TOOLS_HUB_LAST_UPDATED}
            />
            <section aria-labelledby="tools-title" className="px-6">
              <h2 id="tools-title" className="sr-only">
                {TOOLS_HUB_PAGE.navLabel}
              </h2>
              <Stage className="mx-auto max-w-280">
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <li key={tool.path}>
                      <LinkCard to={tool.path} title={tool.label} description={tool.description} />
                    </li>
                  ))}
                </ul>
              </Stage>
            </section>
            <ContentFaq id="tools-faq-title" faqs={TOOLS_HUB_PAGE.faqs} />
          </>
        )}
      </MarketingPage>
    </>
  );
}
