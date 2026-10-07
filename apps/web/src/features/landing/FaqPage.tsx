import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { MarketingPage } from "./components/content/MarketingPage";
import { PageHero } from "./components/content/PageHero";
import { FaqList } from "./components/FaqList";
import { getFaqCategoriesWithItems } from "./faqRegistry";

const CLOSING = {
  body: "Create a free account, upload your first sources, and generate study or research outputs in minutes.",
  ctaLabel: "Create free account",
};

export function FaqPage() {
  const categories = getFaqCategoriesWithItems();

  return (
    <>
      <SEOMeta
        pagePath="/faq"
        title="FAQ | SolomindLM"
        description="Answers about SolomindLM study tools, research workflows, pricing, privacy, and how to get started with notebooks and sources."
        keywords="SolomindLM FAQ, study tools help, research assistant questions, pricing limits, AI learning"
      />
      <MarketingPage closing={CLOSING}>
        {() => (
          <>
            <PageHero
              eyebrow="Help center"
              title="Frequently asked questions"
              titleAccent="questions"
              lede="Everything we answer about study tools, research workflows, billing, and privacy—organized by topic."
            />
            <div className="px-6 pt-2">
              <nav aria-label="FAQ topics">
                <ul className="flex flex-wrap justify-center gap-2">
                  {categories.map((category) => (
                    <li key={category.id}>
                      <Button asChild variant="outline" size="sm">
                        <a href={`#${category.id}`}>{category.title}</a>
                      </Button>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            <section className="px-6 pt-12">
              {categories.map((category) => (
                <div
                  key={category.id}
                  id={category.id}
                  className="mx-auto grid max-w-280 scroll-mt-24 grid-cols-1 gap-8 py-10 lg:grid-cols-12 lg:gap-20"
                >
                  <div className="lg:col-span-4">
                    <h2 className="font-display text-2xl font-bold">{category.title}</h2>
                    <p className="mt-3 font-serif text-base text-foreground/70">
                      {category.description}
                    </p>
                  </div>
                  <div className="lg:col-span-8">
                    <FaqList faqs={category.faqs} />
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </MarketingPage>
    </>
  );
}
