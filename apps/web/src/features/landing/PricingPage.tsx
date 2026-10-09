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
import { ContentFaq } from "./components/content/ContentFaq";
import { MarketingPage } from "./components/content/MarketingPage";
import { PageHero } from "./components/content/PageHero";
import { PricingSection } from "./components/home/PricingSection";
import { getBillingFaqs } from "./faqRegistry";
import { getPricingRows, PRICING_PAGE } from "./pricingPageContent";

/** /pricing: the home page's plan cards, every price in one table, and the billing FAQ. */
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
            <PricingSection onGetStarted={openSignup} />
            <PriceTable />
            {faqs.length > 0 ? <ContentFaq id="pricing-faq-title" faqs={faqs} /> : null}
          </>
        )}
      </MarketingPage>
    </>
  );
}

/** Both billing periods side by side, so no price hides behind the plan cards' tabs. */
function PriceTable() {
  return (
    <section aria-labelledby="price-table-title" className="px-6">
      <div className="mx-auto max-w-215">
        <h2 id="price-table-title" className="font-display text-3xl font-bold tracking-tight">
          {PRICING_PAGE.tableTitle}
        </h2>
        {/* The table keeps a min width and scrolls sideways inside the card on phones. */}
        <Card variant="flush" className="mt-6">
          <Table aria-labelledby="price-table-title" className="min-w-120">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Plan</TableHead>
                <TableHead scope="col">Price</TableHead>
                <TableHead scope="col">Billing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getPricingRows().map((row) => (
                <TableRow key={row.plan}>
                  <TableHead scope="row">{row.plan}</TableHead>
                  <TableCell>{row.price}</TableCell>
                  <TableCell>{row.billing}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <p className="mt-3 font-sans text-xs leading-relaxed text-muted-foreground">
          Prices in US dollars.
        </p>
      </div>
    </section>
  );
}
