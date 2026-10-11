import { ArrowRight, Scale } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { formatSeoDate } from "@/shared/seo/seoDates";
import { ContentFaq } from "./components/content/ContentFaq";
import { LinkCard } from "./components/content/LinkCard";
import { MarketingPage } from "./components/content/MarketingPage";
import { PageHero } from "./components/content/PageHero";
import { Stage } from "./components/content/Stage";
import { Accent, SectionHeading } from "./components/home/SectionHeading";
import {
  getSeoContentBreadcrumbItems,
  getSeoContentLastUpdated,
  getSeoContentPageByPath,
  type SeoContentPageConfig,
} from "./seoContentPages";

type SeoContentPageProps = {
  pagePath: string;
};

/** Comparison pages, guides and the /compare hub. */
export function SeoContentPage({ pagePath }: SeoContentPageProps) {
  const page = getSeoContentPageByPath(pagePath);
  if (!page) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <SEOMeta
        pagePath={page.path}
        title={page.title}
        description={page.description}
        keywords={page.keywords}
        ogType="article"
      />
      <MarketingPage closing={{ body: page.conversionPromise, ctaLabel: page.ctaLabel }}>
        {(openSignup) => (
          <>
            <PageHero
              breadcrumbs={getSeoContentBreadcrumbItems(page)}
              title={page.h1}
              titleAccent={page.h1Accent}
              lede={page.intro}
              updated={getSeoContentLastUpdated(page)}
              // A quick answer carries the sign-up button, so the hero doesn't repeat it.
              cta={page.quickAnswer ? undefined : { label: page.ctaLabel, onClick: openSignup }}
            />
            {page.quickAnswer ? <QuickAnswer page={page} onSignup={openSignup} /> : null}
            {page.comparisonTable ? <ComparisonTable page={page} /> : null}
            <Article sections={page.sections} />
            {page.faqs.length > 0 ? <ContentFaq id="faq-title" faqs={page.faqs} /> : null}
            <RelatedPages links={page.relatedLinks} />
          </>
        )}
      </MarketingPage>
    </>
  );
}

function competitorOf(page: SeoContentPageConfig) {
  return page.competitorName ?? "Alternative";
}

function QuickAnswer({ page, onSignup }: { page: SeoContentPageConfig; onSignup: () => void }) {
  const answer = page.quickAnswer;
  if (!answer) return null;

  return (
    <section aria-labelledby="quick-answer-title" className="px-6">
      <Stage className="mx-auto max-w-280">
        <h2
          id="quick-answer-title"
          className="flex items-center justify-center gap-2 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          <Scale aria-hidden className="size-3.5" />
          Quick answer
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {answer.chooseCompetitor ? (
            <Card variant="flush">
              <div className="p-6 md:p-7">
                <h3 className="font-display text-lg font-bold">Choose {competitorOf(page)} if…</h3>
                <p className="mt-3 font-serif text-base leading-relaxed text-foreground/80">
                  {answer.chooseCompetitor}
                </p>
              </div>
            </Card>
          ) : null}
          <Card
            variant="featured"
            className={answer.chooseCompetitor ? undefined : "md:col-span-2"}
          >
            <div className="p-6 md:p-7">
              <h3 className="font-display text-lg font-bold text-primary">Choose SolomindLM if…</h3>
              <p className="mt-3 font-serif text-base leading-relaxed text-foreground/80">
                {answer.chooseSolomindlm}
              </p>
              <Button className="mt-5" onClick={onSignup}>
                {page.ctaLabel}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </Card>
        </div>
      </Stage>
    </section>
  );
}

function ComparisonTable({ page }: { page: SeoContentPageConfig }) {
  const rows = page.comparisonTable;
  if (!rows) return null;

  return (
    <section aria-labelledby="table-title" className="px-6 pt-16">
      <div className="mx-auto max-w-280">
        <h2 id="table-title" className="font-display text-3xl font-bold tracking-tight">
          Side by side
        </h2>
        {/* The table keeps a min width and scrolls sideways inside the card on phones. */}
        <Card variant="flush" className="mt-6">
          <Table aria-labelledby="table-title" className="min-w-160">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-44">
                  Topic
                </TableHead>
                <TableHead scope="col" highlight>
                  SolomindLM
                </TableHead>
                <TableHead scope="col">{competitorOf(page)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.topic}>
                  <TableHead scope="row">{row.topic}</TableHead>
                  <TableCell highlight>{row.solomindlm}</TableCell>
                  <TableCell>{row.competitor}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <SeoContentSources page={page} />
      </div>
    </section>
  );
}

function SeoContentSources({ page }: { page: SeoContentPageConfig }) {
  if (!page.sources || page.sources.length === 0) return null;
  const checked = getSeoContentLastUpdated(page);

  return (
    <p className="mt-3 font-sans text-xs leading-relaxed text-muted-foreground">
      {page.competitorName} details checked <time dateTime={checked}>{formatSeoDate(checked)}</time>{" "}
      against:{" "}
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

function Article({ sections }: { sections: SeoContentPageConfig["sections"] }) {
  return (
    <section className="px-6 pt-16">
      <div className="mx-auto max-w-170 space-y-14">
        {sections.map((section) => (
          <article key={section.h2}>
            <h2 className="font-display text-3xl font-bold tracking-tight">{section.h2}</h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-5 font-serif text-lg leading-relaxed text-foreground/80"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets && section.bullets.length > 0 ? (
              <ul className="mt-5 grid gap-3">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-3 font-serif text-lg leading-relaxed text-foreground/80"
                  >
                    <span aria-hidden className="mt-3 size-1.5 shrink-0 rounded-full bg-primary" />
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

function RelatedPages({ links }: { links: SeoContentPageConfig["relatedLinks"] }) {
  if (links.length === 0) return null;

  return (
    <section aria-labelledby="related-title" className="px-6 pb-16 md:pb-24">
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="related-title"
          eyebrow="Keep reading"
          title={
            <>
              Related <Accent>pages</Accent>
            </>
          }
          sub="Continue with SolomindLM study and research workflows."
        />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.path}>
              <LinkCard to={link.path} title={link.label} description={link.description} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
