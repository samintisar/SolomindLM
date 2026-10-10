import { cva } from "class-variance-authority";
import { Navigate } from "react-router-dom";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import {
  type ClusterHubPageConfig,
  type ClusterHubSection,
  getClusterHubLastUpdated,
  getClusterHubPageByPath,
  resolveHubSectionPages,
} from "./clusterHubPages";
import { CheckRow } from "./components/content/CheckRow";
import { ContentFaq } from "./components/content/ContentFaq";
import { LinkCard } from "./components/content/LinkCard";
import { MarketingPage } from "./components/content/MarketingPage";
import { PageHero } from "./components/content/PageHero";
import { Stage } from "./components/content/Stage";
import { Accent, SectionHeading } from "./components/home/SectionHeading";
import type { IntentLandingPageConfig } from "./intentLandingPages";
import { getIntentTool } from "./intentTools";

type ClusterHubLandingPageProps = {
  pagePath: string;
};

type ToolGroupData = { section: ClusterHubSection; pages: IntentLandingPageConfig[] };

export function ClusterHubLandingPage({ pagePath }: ClusterHubLandingPageProps) {
  const page = getClusterHubPageByPath(pagePath);
  if (!page) return <Navigate to="/" replace />;

  const isStudents = page.cluster === "students";
  const groups = page.sections
    .map((section) => ({ section, pages: resolveHubSectionPages(page, section) }))
    .filter((group) => group.pages.length > 0);

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
              eyebrow={isStudents ? "For students" : "For researchers"}
              title={page.h1}
              titleAccent={page.h1Accent}
              lede={page.subheadline}
              updated={getClusterHubLastUpdated(page)}
              cta={{ label: page.ctaLabel, onClick: openSignup }}
            />
            <section aria-labelledby="tools-title" className="px-6">
              <h2 id="tools-title" className="sr-only">
                {isStudents ? "Study tools" : "Research tools"}
              </h2>
              <Stage className="mx-auto max-w-280">
                <div className="flex flex-col gap-10">
                  {groups.map((group, index) => (
                    <ToolGroup key={group.section.title} number={index + 1} {...group} />
                  ))}
                </div>
              </Stage>
              <div className="mx-auto mt-12 max-w-280">
                <CheckRow items={page.summaryBullets} columns={2} />
              </div>
            </section>
            {page.guideLinks.length > 0 ? <Guides page={page} /> : null}
            {page.faqs.length > 0 ? <ContentFaq id="hub-faq-title" faqs={page.faqs} /> : null}
          </>
        )}
      </MarketingPage>
    </>
  );
}

const toolGrid = cva("mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2", {
  variants: {
    size: {
      few: "lg:grid-cols-3",
      many: "lg:grid-cols-4",
    },
  },
});

/** One numbered group of the tool directory: heading row, description and a grid of tool cards. */
function ToolGroup({ number, section, pages }: ToolGroupData & { number: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-xl font-bold">
          {number} · {section.title}
        </h3>
        <p className="shrink-0 font-sans text-sm text-muted-foreground">
          {pages.length} {pages.length === 1 ? "tool" : "tools"}
        </p>
      </div>
      <p className="mt-2 max-w-2xl font-serif text-base text-foreground/70">
        {section.description}
      </p>
      <ul className={toolGrid({ size: pages.length > 3 ? "many" : "few" })}>
        {pages.map((child) => (
          <li key={child.path}>
            <LinkCard
              to={child.path}
              title={child.navLabel}
              description={child.cardBlurb}
              headingLevel="h4"
              {...getIntentTool(child.intentKey)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Guides({ page }: { page: ClusterHubPageConfig }) {
  return (
    <section aria-labelledby="guides-title" className="px-6 pt-20">
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="guides-title"
          eyebrow="Keep reading"
          title={
            <>
              Guides and <Accent>comparisons</Accent>
            </>
          }
          sub={`Practical workflows and tool comparisons to help you choose the right approach for ${
            page.cluster === "students"
              ? "studying from your materials"
              : "managing your reading list"
          }.`}
        />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.guideLinks.map((link) => (
            <li key={link.path}>
              <LinkCard to={link.path} title={link.label} description={link.description} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
