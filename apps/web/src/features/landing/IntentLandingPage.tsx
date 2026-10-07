import { ChevronRight } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import {
  MarketingBreadcrumb,
  MarketingFaqSection,
  MarketingFinalCta,
  MarketingLinkCard,
  MarketingPageShell,
} from "./components/MarketingPageShell";
import {
  getIntentBreadcrumbItems,
  getIntentLandingPageByPath,
  getRelatedIntentPages,
  type IntentLandingPageConfig,
} from "./intentLandingPages";

type IntentLandingPageProps = {
  pagePath: string;
};

export function IntentLandingPage({ pagePath }: IntentLandingPageProps) {
  const page = getIntentLandingPageByPath(pagePath);

  if (!page) {
    return <Navigate to="/" replace />;
  }

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
          <IntentHero page={page} onSignup={openSignup} />
          <MarketingFaqSection faqs={page.faqs} className="bg-card/30" />
          <IntentRelatedFeaturesSection page={page} />
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

function IntentHero({ page, onSignup }: { page: IntentLandingPageConfig; onSignup: () => void }) {
  return (
    <section className="px-6 md:px-8 pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <MarketingBreadcrumb items={getIntentBreadcrumbItems(page)} />
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight">
            {page.h1}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            {page.subheadline}
          </p>
          {page.heroCrossLink ? (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-5 text-left max-w-xl mx-auto">
              <p className="text-sm font-semibold text-foreground mb-1">
                {page.heroCrossLink.label}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {page.heroCrossLink.description}
              </p>
              <Link
                to={page.heroCrossLink.path}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {page.heroCrossLink.linkLabel}
                <ChevronRight className="w-4 h-4" aria-hidden />
              </Link>
            </div>
          ) : null}
          <Button size="lg" onClick={onSignup}>
            {page.ctaLabel}
          </Button>
        </div>

        {page.proofBullets.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {page.proofBullets.map((bullet, index) => (
              <div
                key={bullet}
                className="rounded-xl border border-border bg-card/80 p-6 shadow-sm"
              >
                <p className="text-xs font-mono text-muted-foreground mb-2">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="text-sm text-foreground leading-relaxed">{bullet}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Example workflow
          </p>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="rounded-lg bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground mb-1">Source</p>
              <p className="text-sm font-medium text-foreground">{page.sourceToOutput.source}</p>
            </div>
            <p className="text-center text-muted-foreground hidden md:block" aria-hidden>
              →
            </p>
            <div className="rounded-lg bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground mb-1">Output</p>
              <p className="text-sm font-medium text-foreground">{page.sourceToOutput.output}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IntentRelatedFeaturesSection({ page }: { page: IntentLandingPageConfig }) {
  const relatedPages = getRelatedIntentPages(page);
  if (relatedPages.length === 0) return null;

  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
            Related features
          </h2>
          <p className="text-muted-foreground">
            Explore other {page.cluster === "students" ? "study" : "research"} workflows in
            SolomindLM.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {relatedPages.map((relatedPage) => (
            <li key={relatedPage.path}>
              <MarketingLinkCard
                to={relatedPage.path}
                title={relatedPage.navLabel}
                description={relatedPage.subheadline}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
