import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import {
  type ClusterHubPageConfig,
  getClusterHubPageByPath,
  resolveHubSectionPages,
} from "./clusterHubPages";
import { Footer } from "./components/Footer";
import { setSignupIntent } from "./landingSignup";

type ClusterHubLandingPageProps = {
  pagePath: string;
};

export function ClusterHubLandingPage({ pagePath }: ClusterHubLandingPageProps) {
  const page = getClusterHubPageByPath(pagePath);
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
    setSignupIntent(page.cluster);
    setAuthModalOpen(true);
  };

  const clusterLabel = page.cluster === "students" ? "For students" : "For researchers";

  return (
    <>
      <SEOMeta
        pagePath={page.path}
        title={page.title}
        description={page.description}
        keywords={page.keywords}
      />
      <div className="min-h-screen landing-grid-pattern">
        <HubHeader />
        <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="max-w-3xl mx-auto text-center space-y-8">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">
                {clusterLabel}
              </p>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight">
                {page.h1}
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                {page.subheadline}
              </p>
              <Button size="lg" onClick={openSignup} className="font-semibold px-8">
                {page.ctaLabel}
              </Button>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2 max-w-4xl mx-auto">
              {page.summaryBullets.map((bullet) => (
                <li
                  key={bullet}
                  className="rounded-xl border border-border bg-card/80 p-5 text-sm text-foreground leading-relaxed"
                >
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <HubChildPagesSection page={page} />
        <HubFaqSection
          page={page}
          openFaqIndex={openFaqIndex}
          onToggleFaq={(index) => setOpenFaqIndex(openFaqIndex === index ? null : index)}
        />
        <HubFinalCta page={page} onSignup={openSignup} />
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

function HubHeader() {
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

function HubChildPagesSection({ page }: { page: ClusterHubPageConfig }) {
  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
      <div className="max-w-5xl mx-auto space-y-14">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
            Explore {page.cluster === "students" ? "study" : "research"} tools
          </h2>
          <p className="text-muted-foreground">
            Each page explains one workflow in plain language—what it does, what you need to get
            started, and what to verify before you rely on the output.
          </p>
        </div>

        {page.sections.map((section) => {
          const childPages = resolveHubSectionPages(page, section);
          if (childPages.length === 0) return null;

          return (
            <div key={section.title} className="space-y-6">
              <div>
                <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                  {section.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.description}
                </p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {childPages.map((child) => (
                  <li key={child.path}>
                    <Link
                      to={child.path}
                      className="group flex flex-col h-full rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {child.navLabel}
                      </span>
                      <span className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                        {child.subheadline}
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
          );
        })}
      </div>
    </section>
  );
}

function HubFaqSection({
  page,
  openFaqIndex,
  onToggleFaq,
}: {
  page: ClusterHubPageConfig;
  openFaqIndex: number | null;
  onToggleFaq: (index: number) => void;
}) {
  if (page.faqs.length === 0) return null;

  return (
    <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60">
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

function HubFinalCta({ page, onSignup }: { page: ClusterHubPageConfig; onSignup: () => void }) {
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
