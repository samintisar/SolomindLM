import { SEOMeta } from "@/shared/seo/SEOMeta";
import { ContentFaq } from "./components/content/ContentFaq";
import { MarketingPage } from "./components/content/MarketingPage";
import { PageHero } from "./components/content/PageHero";
import { PricingSection } from "./components/home/PricingSection";
import { getBillingFaqs } from "./faqRegistry";
import { PRICING_PAGE } from "./pricingPageContent";

/** /pricing: the home page's plan cards and the billing FAQ. */
export function PricingPage() {
  const faqs = getBillingFaqs();

  return (
    <>
      <SEOMeta
        pagePath={PRICING_PAGE.path}
        title={PRICING_PAGE.title}
        description={PRICING_PAGE.description}
        keywords={PRICING_PAGE.keywords}
      />
      <MarketingPage closing={PRICING_PAGE.closing}>
        {(openSignup) => (
          <>
            <PageHero
              breadcrumbs={PRICING_PAGE.breadcrumbs}
              title={PRICING_PAGE.h1}
              titleAccent={PRICING_PAGE.h1Accent}
              lede={PRICING_PAGE.lede}
            />
            <PricingSection onGetStarted={openSignup} note={PRICING_PAGE.currencyNote} />
            {faqs.length > 0 ? <ContentFaq id="pricing-faq-title" faqs={faqs} /> : null}
          </>
        )}
      </MarketingPage>
    </>
  );
}
