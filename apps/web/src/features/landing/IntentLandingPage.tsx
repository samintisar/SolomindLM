import { ArrowRight } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/card";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { CheckRow } from "./components/content/CheckRow";
import { ContentFaq } from "./components/content/ContentFaq";
import { LinkCard } from "./components/content/LinkCard";
import { MarketingPage } from "./components/content/MarketingPage";
import { PageHero } from "./components/content/PageHero";
import { SourceToOutput } from "./components/content/SourceToOutput";
import { Reveal } from "./components/home/Reveal";
import { Accent, SectionHeading } from "./components/home/SectionHeading";
import {
  getIntentBreadcrumbItems,
  getIntentLandingPageByPath,
  getRelatedIntentPages,
  type IntentLandingCluster,
  type IntentLandingPageConfig,
} from "./intentLandingPages";
import { getIntentTool } from "./intentTools";

type IntentLandingPageProps = {
  pagePath: string;
};

/** A tool page: hero, source → output stage, proof points, FAQ, related tools, closing. */
export function IntentLandingPage({ pagePath }: IntentLandingPageProps) {
  const page = getIntentLandingPageByPath(pagePath);
  if (!page) return <Navigate to="/" replace />;
  const related = getRelatedIntentPages(page);

  return (
    <>
      <SEOMeta
        pagePath={page.path}
        title={page.title}
        description={page.description}
        keywords={page.keywords}
      />
      <MarketingPage closing={{ body: page.conversionPromise, ctaLabel: page.ctaLabel }}>
        {(openSignup) => (
          <>
            <PageHero
              breadcrumbs={getIntentBreadcrumbItems(page)}
              title={page.h1}
              titleAccent={page.h1Accent}
              lede={page.subheadline}
              cta={{ label: page.ctaLabel, onClick: openSignup }}
            />
            <section aria-label="How it works" className="px-6">
              <div className="mx-auto max-w-280">
                <Reveal>
                  <SourceToOutput intentKey={page.intentKey} caption={page.sourceToOutput} />
                </Reveal>
                {page.proofBullets.length > 0 ? (
                  <div className="mt-10 md:mt-12">
                    <CheckRow items={page.proofBullets} />
                  </div>
                ) : null}
                {page.heroCrossLink ? <CrossLinkCard link={page.heroCrossLink} /> : null}
              </div>
            </section>
            {page.faqs.length > 0 ? <ContentFaq id="tool-faq-title" faqs={page.faqs} /> : null}
            {related.length > 0 ? <RelatedTools pages={related} cluster={page.cluster} /> : null}
          </>
        )}
      </MarketingPage>
    </>
  );
}

/** A pointer to a neighbouring tool (e.g. quizzes → written questions), under the proof points. */
function CrossLinkCard({ link }: { link: NonNullable<IntentLandingPageConfig["heroCrossLink"]> }) {
  return (
    <Card variant="flush" className="mx-auto mt-10 max-w-xl">
      <div className="flex flex-col gap-2 p-5 md:p-6">
        <p className="font-sans text-sm font-semibold">{link.label}</p>
        <p className="font-serif text-base leading-relaxed text-foreground/75">
          {link.description}
        </p>
        <Link
          to={link.path}
          className="inline-flex items-center gap-1.5 self-start font-sans text-sm font-semibold text-primary hover:underline"
        >
          Written questions with feedback
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

const RELATED_ACCENT: Record<IntentLandingCluster, string> = {
  students: "study tools",
  research: "research tools",
};

function RelatedTools({
  pages,
  cluster,
}: {
  pages: IntentLandingPageConfig[];
  cluster: IntentLandingCluster;
}) {
  return (
    <section aria-labelledby="related-title" className="px-6 pb-8">
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="related-title"
          eyebrow="Related tools"
          title={
            <>
              Explore other <Accent>{RELATED_ACCENT[cluster]}</Accent>
            </>
          }
        />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((relatedPage) => (
            <li key={relatedPage.path}>
              <LinkCard
                to={relatedPage.path}
                title={relatedPage.navLabel}
                description={relatedPage.cardBlurb}
                {...getIntentTool(relatedPage.intentKey)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
