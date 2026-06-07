import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "./components/Footer";
import {
  getIntentBreadcrumbItems,
  getIntentLandingPageByPath,
  getRelatedIntentPages,
  type IntentLandingPageConfig,
} from "./intentLandingPages";
import { setSignupIntent } from "./landingSignup";

type IntentLandingPageProps = {
  pagePath: string;
};

export function IntentLandingPage({ pagePath }: IntentLandingPageProps) {
  const page = getIntentLandingPageByPath(pagePath);
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
    setSignupIntent(page.intentKey);
    setAuthModalOpen(true);
  };

  return (
    <>
      <SEOMeta
        pagePath={page.path}
        title={page.title}
        description={page.description}
        keywords={page.keywords}
      />
      <div className="min-h-screen landing-grid-pattern">
        <IntentHeader />
        <IntentHero page={page} onSignup={openSignup} />
        <IntentFaqSection
          page={page}
          openFaqIndex={openFaqIndex}
          onToggleFaq={(index) => setOpenFaqIndex(openFaqIndex === index ? null : index)}
        />
        <IntentRelatedFeaturesSection page={page} />
        <IntentFinalCta page={page} onSignup={openSignup} />
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

function IntentHeader() {
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

function IntentHero({ page, onSignup }: { page: IntentLandingPageConfig; onSignup: () => void }) {
  const breadcrumbItems = getIntentBreadcrumbItems(page);

  return (
    <section className="px-6 md:px-8 pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <IntentBreadcrumb items={breadcrumbItems} />
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight">
            {page.h1}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            {page.subheadline}
          </p>
          <Button size="lg" onClick={onSignup} className="font-semibold px-8">
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

function IntentBreadcrumb({ items }: { items: ReturnType<typeof getIntentBreadcrumbItems> }) {
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
              <Link
                to={relatedPage.path}
                className="group flex flex-col h-full rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {relatedPage.navLabel}
                </span>
                <span className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                  {relatedPage.subheadline}
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

function IntentFaqSection({
  page,
  openFaqIndex,
  onToggleFaq,
}: {
  page: IntentLandingPageConfig;
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

function IntentFinalCta({
  page,
  onSignup,
}: {
  page: IntentLandingPageConfig;
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
