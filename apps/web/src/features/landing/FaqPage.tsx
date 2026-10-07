import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { FaqRow } from "./components/home/FaqSection";
import { MarketingFinalCta, MarketingPageShell } from "./components/MarketingPageShell";
import { getFaqCategoriesWithItems } from "./faqRegistry";

export function FaqPage() {
  const categories = getFaqCategoriesWithItems();

  return (
    <MarketingPageShell>
      {(openSignup) => (
        <>
          <SEOMeta
            pagePath="/faq"
            title="FAQ | SolomindLM"
            description="Answers about SolomindLM study tools, research workflows, pricing, privacy, and how to get started with notebooks and sources."
            keywords="SolomindLM FAQ, study tools help, research assistant questions, pricing limits, AI learning"
          />
          <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">
                Help center
              </p>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight">
                Frequently asked questions
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Everything we answer about study tools, research workflows, billing, and
                privacy—organized by topic.
              </p>
            </div>
          </section>

          <section className="px-6 md:px-8 pb-20 md:pb-28">
            <div className="max-w-3xl mx-auto space-y-16">
              {categories.map((category) => (
                <div key={category.id} id={category.id} className="scroll-mt-24 space-y-6">
                  <div>
                    <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                      {category.title}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {category.description}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {category.faqs.map((faq) => (
                      <li key={faq.question}>
                        <FaqRow faq={faq} defaultOpen={false}>
                          {faq.learnMorePath && faq.learnMoreLabel ? (
                            <Link
                              to={faq.learnMorePath}
                              className="inline-flex items-center gap-1 font-sans text-sm font-medium text-primary hover:underline"
                            >
                              {faq.learnMoreLabel}
                              <ChevronRight className="size-4" aria-hidden />
                            </Link>
                          ) : null}
                        </FaqRow>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <MarketingFinalCta
            title="Ready to try SolomindLM?"
            ctaLabel="Create free account"
            onSignup={openSignup}
            className="border-t border-border/60 bg-card/30"
          >
            <p className="text-muted-foreground">
              Create a free account, upload your first sources, and generate study or research
              outputs in minutes.
            </p>
          </MarketingFinalCta>
        </>
      )}
    </MarketingPageShell>
  );
}
