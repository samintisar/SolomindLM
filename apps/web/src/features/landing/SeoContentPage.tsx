import { Navigate } from "react-router-dom";
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
  getSeoContentBreadcrumbItems,
  getSeoContentLastUpdated,
  getSeoContentPageByPath,
  type SeoContentPageConfig,
} from "./seoContentPages";

type SeoContentPageProps = {
  pagePath: string;
};

export function SeoContentPage({ pagePath }: SeoContentPageProps) {
  const page = getSeoContentPageByPath(pagePath);

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
            ogType="article"
          />
          <SeoContentHero page={page} onSignup={openSignup} />
          <SeoContentBody page={page} />
          <MarketingFaqSection faqs={page.faqs} className="bg-card/30" />
          <SeoContentRelatedSection page={page} />
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

function SeoContentHero({ page, onSignup }: { page: SeoContentPageConfig; onSignup: () => void }) {
  return (
    <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <MarketingBreadcrumb items={getSeoContentBreadcrumbItems(page)} />
        <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight text-center">
          {page.h1}
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed text-center">
          {page.intro}
        </p>
        {page.quickAnswer ? (
          <div className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick answer
            </p>
            {page.quickAnswer.chooseCompetitor ? (
              <p className="text-sm text-foreground leading-relaxed">
                <span className="font-medium">{page.competitorName}:</span>{" "}
                {page.quickAnswer.chooseCompetitor}
              </p>
            ) : null}
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium">SolomindLM:</span> {page.quickAnswer.chooseSolomindlm}
            </p>
          </div>
        ) : null}
        <div className="flex justify-center">
          <Button size="lg" onClick={onSignup}>
            {page.ctaLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SeoContentBody({ page }: { page: SeoContentPageConfig }) {
  return (
    <section className="px-6 md:px-8 pb-16 md:pb-20">
      <div className="max-w-3xl mx-auto space-y-12">
        {page.comparisonTable ? (
          <div className="space-y-4">
            <SeoContentComparisonTable
              rows={page.comparisonTable}
              competitorName={page.competitorName ?? "Alternative"}
            />
            <SeoContentSources page={page} />
          </div>
        ) : null}
        {page.sections.map((section) => (
          <article key={section.h2} className="space-y-4">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              {section.h2}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-muted-foreground leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.bullets && section.bullets.length > 0 ? (
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="leading-relaxed">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function SeoContentComparisonTable({
  rows,
  competitorName,
}: {
  rows: NonNullable<SeoContentPageConfig["comparisonTable"]>;
  competitorName: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm bg-card">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th scope="col" className="px-4 py-3 text-left font-semibold text-foreground">
              Topic
            </th>
            <th scope="col" className="px-4 py-3 text-left font-semibold text-foreground">
              SolomindLM
            </th>
            <th scope="col" className="px-4 py-3 text-left font-semibold text-foreground">
              {competitorName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.topic} className="border-b border-border/60 last:border-0">
              <th scope="row" className="px-4 py-3 text-left font-medium text-foreground align-top">
                {row.topic}
              </th>
              <td className="px-4 py-3 text-muted-foreground align-top leading-relaxed">
                {row.solomindlm}
              </td>
              <td className="px-4 py-3 text-muted-foreground align-top leading-relaxed">
                {row.competitor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeoContentSources({ page }: { page: SeoContentPageConfig }) {
  if (!page.sources || page.sources.length === 0) return null;
  const checked = new Date(`${getSeoContentLastUpdated(page)}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
  );

  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      {page.competitorName} details checked {checked} against:{" "}
      {page.sources.map((source, index) => (
        <span key={source.url}>
          {index > 0 ? ", " : null}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {source.label}
          </a>
        </span>
      ))}
      . Plans and features change; check their site before you decide.
    </p>
  );
}

function SeoContentRelatedSection({ page }: { page: SeoContentPageConfig }) {
  if (page.relatedLinks.length === 0) return null;

  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
            Related pages
          </h2>
          <p className="text-muted-foreground">
            Continue with SolomindLM study and research workflows.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.relatedLinks.map((link) => (
            <li key={link.path}>
              <MarketingLinkCard to={link.path} title={link.label} description={link.description} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
