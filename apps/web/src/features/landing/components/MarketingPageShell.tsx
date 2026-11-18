import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";
import { isNativeShell } from "@/utils/platformDetection";
import type { FAQItem } from "../constants";
import { Footer } from "./Footer";
import { FaqRow } from "./home/FaqSection";

interface MarketingPageShellProps {
  /** Page body; `openSignup` opens the sign-up dialog. */
  children: (openSignup: () => void) => ReactNode;
}

/**
 * Frame for the public SEO pages (intent, cluster hub, comparison, FAQ): logo header, footer and the
 * sign-up dialog. The native app has no marketing pages, so it goes straight to the app or sign-in.
 */
export function MarketingPageShell({ children }: MarketingPageShellProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (isNativeShell()) {
    if (isLoading) return <div className="min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  return (
    <>
      <div className="min-h-screen landing-grid-pattern">
        <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-300 items-center justify-between gap-4 px-6">
            <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold">
              <img src="/SolomindLM_logo.png" alt="" className="size-8 object-contain" />
              SolomindLM
            </Link>
            <Button variant="ghost" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </header>
        <main>{children(() => setAuthModalOpen(true))}</main>
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

/** A page's FAQ list; the first answer starts open and closed answers stay in the HTML. */
export function MarketingFaqSection({ faqs, className }: { faqs: FAQItem[]; className?: string }) {
  if (faqs.length === 0) return null;
  return (
    <section className={cn("border-t border-border/60 px-6 py-16 md:px-8 md:py-20", className)}>
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-foreground md:text-3xl">
          Frequently asked questions
        </h2>
        <ul className="flex flex-col gap-2.5">
          {faqs.map((faq, index) => (
            <li key={faq.question}>
              <FaqRow faq={faq} defaultOpen={index === 0} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Closing call to action: a promise and the sign-up button. */
export function MarketingFinalCta({
  title,
  ctaLabel,
  onSignup,
  children,
  className,
}: {
  title: string;
  ctaLabel: string;
  onSignup: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-6 py-16 md:px-8 md:py-20", className)}>
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">{title}</h2>
        {children}
        <Button size="lg" onClick={onSignup}>
          {ctaLabel}
        </Button>
      </div>
    </section>
  );
}

/** A card linking to another page, with a short description and "Learn more". */
export function MarketingLinkCard({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex h-full flex-col rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline transition-shadow hover:shadow-md"
    >
      <span className="font-medium text-foreground transition-colors group-hover:text-primary">
        {title}
      </span>
      <span className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
        {description}
      </span>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        Learn more
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}

/** Centered breadcrumb trail; the last item is the current page. */
export function MarketingBreadcrumb({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex justify-center">
      <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={item.path} className="inline-flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden className="text-border">
                /
              </span>
            ) : null}
            {index === items.length - 1 ? (
              <span className="font-medium text-foreground">{item.name}</span>
            ) : (
              <Link to={item.path} className="transition-colors hover:text-foreground">
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
