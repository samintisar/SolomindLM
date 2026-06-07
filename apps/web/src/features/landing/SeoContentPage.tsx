import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "./components/Footer";
import { setSignupIntent } from "./landingSignup";
import {
  getSeoContentBreadcrumbItems,
  getSeoContentPageByPath,
  type SeoContentPageConfig,
} from "./seoContentPages";

type SeoContentPageProps = {
  pagePath: string;
};

export function SeoContentPage({ pagePath }: SeoContentPageProps) {
  const page = getSeoContentPageByPath(pagePath);
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  if (!page) {
    return <Navigate to="/" replace />;
  }

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="min-h-screen bg-background" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const openSignup = () => {
    setSignupIntent(page.signupIntentKey);
    setAuthModalOpen(true);
  };

  return (
    <>
      <SEOMeta
        pagePath={page.path}
        title={page.title}
        description={page.description}
        keywords={page.keywords}
        ogType="article"
      />
      <div className="min-h-screen landing-grid-pattern">
        <SeoContentHeader />
        <SeoContentHero page={page} onSignup={openSignup} />
        <SeoContentBody page={page} />
        <SeoContentFaqSection
          page={page}
          openFaqIndex={openFaqIndex}
          onToggleFaq={(index) => setOpenFaqIndex(openFaqIndex === index ? null : index)}
        />
        <SeoContentRelatedSection page={page} />
        <SeoContentFinalCta page={page} onSignup={openSignup} />
        <Footer />
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => navigate("/home", { replace: true })}
      />
    </>
  );
}

function SeoContentHeader() {
  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <img
            src="/SolomindLM_logo.png"
            alt="SolomindLM"
            className="w-8 h-8 shrink-0 object-contain"
          />
          <span className="text-lg font-display font-bold text-foreground tracking-tight">
            SolomindLM
          </span>
        </Link>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to home
        </Link>
      </div>
    </header>
  );
}

function SeoContentHero({ page, onSignup }: { page: SeoContentPageConfig; onSignup: () => void }) {
  const breadcrumbItems = getSeoContentBreadcrumbItems(page);

  return (
    <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <SeoContentBreadcrumb items={breadcrumbItems} />
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
                <span className="font-medium">NotebookLM:</span> {page.quickAnswer.chooseCompetitor}
              </p>
            ) : null}
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium">SolomindLM:</span> {page.quickAnswer.chooseSolomindlm}
            </p>
          </div>
        ) : null}
        <div className="flex justify-center">
          <Button size="lg" onClick={onSignup} className="font-semibold px-8">
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
        {page.comparisonTable ? <SeoContentComparisonTable rows={page.comparisonTable} /> : null}
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
}: {
  rows: NonNullable<SeoContentPageConfig["comparisonTable"]>;
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
              NotebookLM
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

function SeoContentBreadcrumb({
  items,
}: {
  items: ReturnType<typeof getSeoContentBreadcrumbItems>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex justify-center">
      <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.path} className="inline-flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="text-border">
                  /
                </span>
              ) : null}
              {isLast ? (
                <span className="font-medium text-foreground">{item.name}</span>
              ) : (
                <Link to={item.path} className="hover:text-foreground transition-colors">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
              <Link
                to={link.path}
                className="group flex flex-col h-full rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {link.label}
                </span>
                <span className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                  {link.description}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Learn more
                  <ChevronRight className="w-4 h-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SeoContentFaqSection({
  page,
  openFaqIndex,
  onToggleFaq,
}: {
  page: SeoContentPageConfig;
  openFaqIndex: number | null;
  onToggleFaq: (index: number) => void;
}) {
  if (page.faqs.length === 0) return null;

  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-8 text-center">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {page.faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={faq.question}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onToggleFaq(index)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-secondary/30 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-foreground">{faq.question}</span>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {isOpen ? (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
                    {faq.answer}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SeoContentFinalCta({
  page,
  onSignup,
}: {
  page: SeoContentPageConfig;
  onSignup: () => void;
}) {
  return (
    <section className="px-6 md:px-8 py-16 md:py-20">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          {page.conversionPromise}
        </h2>
        <Button size="lg" onClick={onSignup} className="font-semibold px-8">
          {page.ctaLabel}
        </Button>
      </div>
    </section>
  );
}
