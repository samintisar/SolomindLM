import { Navigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import {
  type ClusterHubPageConfig,
  getClusterHubPageByPath,
  resolveHubSectionPages,
} from "./clusterHubPages";
import {
  MarketingFaqSection,
  MarketingFinalCta,
  MarketingLinkCard,
  MarketingPageShell,
} from "./components/MarketingPageShell";

type ClusterHubLandingPageProps = {
  pagePath: string;
};

export function ClusterHubLandingPage({ pagePath }: ClusterHubLandingPageProps) {
  const page = getClusterHubPageByPath(pagePath);

  if (!page) {
    return <Navigate to="/" replace />;
  }

  const clusterLabel = page.cluster === "students" ? "For students" : "For researchers";

  return (
    <MarketingPageShell>
      {(openSignup) => (
        <>
          <SEOMeta
            pagePath={page.path}
            title={page.title}
            description={page.description}
            keywords={page.keywords}
          />
          <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
            <div className="max-w-5xl mx-auto space-y-10">
              <div className="max-w-3xl mx-auto text-center space-y-8">
                <p className="text-sm font-medium uppercase tracking-wider text-primary">
                  {clusterLabel}
                </p>
                <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight">
                  {page.h1}
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                  {page.subheadline}
                </p>
                <Button size="lg" onClick={openSignup}>
                  {page.ctaLabel}
                </Button>
              </div>

              <ul className="grid gap-4 sm:grid-cols-2 max-w-4xl mx-auto">
                {page.summaryBullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="rounded-xl border border-border bg-card/80 p-5 text-sm text-foreground leading-relaxed"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <HubChildPagesSection page={page} />
          <HubGuideLinksSection page={page} />
          <MarketingFaqSection faqs={page.faqs} />
          <MarketingFinalCta
            title={page.conversionPromise}
            ctaLabel={page.ctaLabel}
            onSignup={openSignup}
          />
        </>
      )}
    </MarketingPageShell>
  );
}

function HubChildPagesSection({ page }: { page: ClusterHubPageConfig }) {
  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
      <div className="max-w-5xl mx-auto space-y-14">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
            Explore {page.cluster === "students" ? "study" : "research"} tools
          </h2>
          <p className="text-muted-foreground">
            Each page explains one workflow in plain language—what it does, what you need to get
            started, and what to verify before you rely on the output.
          </p>
        </div>

        {page.sections.map((section) => {
          const childPages = resolveHubSectionPages(page, section);
          if (childPages.length === 0) return null;

          return (
            <div key={section.title} className="space-y-6">
              <div>
                <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                  {section.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.description}
                </p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {childPages.map((child) => (
                  <li key={child.path}>
                    <MarketingLinkCard
                      to={child.path}
                      title={child.navLabel}
                      description={child.subheadline}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HubGuideLinksSection({ page }: { page: ClusterHubPageConfig }) {
  if (page.guideLinks.length === 0) return null;

  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
            Guides and comparisons
          </h2>
          <p className="text-muted-foreground">
            Practical workflows and tool comparisons to help you choose the right approach for{" "}
            {page.cluster === "students"
              ? "studying from your materials"
              : "managing your reading list"}
            .
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 max-w-4xl mx-auto">
          {page.guideLinks.map((link) => (
            <li key={link.path}>
              <MarketingLinkCard to={link.path} title={link.label} description={link.description} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
