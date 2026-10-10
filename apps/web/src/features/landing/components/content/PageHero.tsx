import { ArrowRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { formatSeoDate } from "@/shared/seo/seoDates";
import { FinePrint } from "../home/FinePrint";
import { FREE_PLAN_LINE } from "../home/landingHomeContent";
import { AccentHeading } from "./accentHeading";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

const HERO_FINE_PRINT = [FREE_PLAN_LINE];

interface PageHeroProps {
  eyebrow?: string;
  breadcrumbs?: Crumb[];
  title: string;
  /** A substring of `title` rendered in the landing accent style. */
  titleAccent?: string;
  lede: string;
  /** ISO date (YYYY-MM-DD) shown as "Updated <date>" under the lede. */
  updated?: string;
  cta?: { label: string; onClick: () => void };
}

/**
 * Centred content-page hero on the graph paper: breadcrumbs or eyebrow, h1, lede, optional
 * "Updated" date and CTA.
 */
export function PageHero({
  eyebrow,
  breadcrumbs,
  title,
  titleAccent,
  lede,
  updated,
  cta,
}: PageHeroProps) {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-12 lg:pt-36">
      <div aria-hidden className="landing-paper pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        {breadcrumbs ? (
          <Breadcrumbs items={breadcrumbs} />
        ) : eyebrow ? (
          <p className="font-sans text-xs font-semibold tracking-widest text-primary uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          <AccentHeading text={title} accent={titleAccent} />
        </h1>
        <p className="max-w-2xl font-serif text-lg leading-relaxed text-foreground/75">{lede}</p>
        {updated ? (
          <p className="font-sans text-xs text-muted-foreground">
            Updated <time dateTime={updated}>{formatSeoDate(updated)}</time>
          </p>
        ) : null}
        {cta ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Button size="lg" onClick={cta.onClick}>
              {cta.label}
              <ArrowRight aria-hidden />
            </Button>
            <FinePrint lines={HERO_FINE_PRINT} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
