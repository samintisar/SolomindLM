import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "./components/Footer";
import { getFaqCategoriesWithItems, type RegisteredFaq } from "./faqRegistry";

export function FaqPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const categories = getFaqCategoriesWithItems();

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="min-h-screen bg-background" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const openSignup = () => setAuthModalOpen(true);

  return (
    <>
      <SEOMeta
        pagePath="/faq"
        title="FAQ | SolomindLM"
        description="Answers about SolomindLM study tools, research workflows, pricing, privacy, and how to get started with notebooks and sources."
        keywords="SolomindLM FAQ, study tools help, research assistant questions, pricing limits, AI learning"
      />
      <div className="min-h-screen landing-grid-pattern">
        <FaqHeader />
        <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Help center</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight">
              Frequently asked questions
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Everything we answer about study tools, research workflows, billing, and privacy—organized
              by topic.
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
                <div className="space-y-3">
                  {category.faqs.map((faq, index) => {
                    const itemId = `faq-${category.id}-${index}`;
                    return (
                      <FaqAccordionItem
                        key={faq.question}
                        faq={faq}
                        itemId={itemId}
                        isOpen={openKey === itemId}
                        onToggle={() =>
                          setOpenKey((current) => (current === itemId ? null : itemId))
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              Ready to try SolomindLM?
            </h2>
            <p className="text-muted-foreground">
              Create a free account, upload your first sources, and generate study or research outputs
              in minutes.
            </p>
            <Button size="lg" onClick={openSignup} className="font-semibold px-8">
              Create free account
            </Button>
          </div>
        </section>

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

function FaqHeader() {
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

function FaqAccordionItem({
  faq,
  itemId,
  isOpen,
  onToggle,
}: {
  faq: RegisteredFaq;
  itemId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-secondary/30 transition-colors"
        aria-expanded={isOpen}
        id={`${itemId}-trigger`}
        aria-controls={`${itemId}-panel`}
      >
        <span className="font-medium text-foreground">{faq.question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {isOpen ? (
        <div
          id={`${itemId}-panel`}
          role="region"
          aria-labelledby={`${itemId}-trigger`}
          className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4 space-y-3"
        >
          <p>{faq.answer}</p>
          {faq.learnMorePath && faq.learnMoreLabel ? (
            <Link
              to={faq.learnMorePath}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {faq.learnMoreLabel}
              <ChevronRight className="w-4 h-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
