import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import type { ToolPageConfig } from "../toolPages";

type ToolHeaderProps = { isAuthenticated: boolean; onSignIn: () => void };

/** Sticky logo bar for a free tool page. */
export function ToolHeader({ isAuthenticated, onSignIn }: ToolHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-12">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <img
            src="/SolomindLM_logo.png"
            alt="SolomindLM"
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="font-display text-lg font-bold tracking-tight text-foreground">
            SolomindLM
          </span>
        </Link>
        {isAuthenticated ? (
          <Button variant="ghost" asChild>
            <Link to="/home">Open SolomindLM</Link>
          </Button>
        ) : (
          <Button variant="ghost" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}

/** How it works, explainer sections, FAQ and related links from a tool's page config. */
export function ToolArticle({ page }: { page: ToolPageConfig }) {
  return (
    <article className="mx-auto mt-20 max-w-3xl space-y-12">
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="font-display text-2xl font-bold text-foreground">
          How it works
        </h2>
        <ol className="mt-4 space-y-3">
          {page.steps.map((step, i) => (
            <li key={step.name} className="text-foreground">
              <span className="font-semibold">
                {i + 1}. {step.name}.
              </span>{" "}
              <span className="text-muted-foreground">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2 className="font-display text-2xl font-bold text-foreground">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p} className="mt-3 leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="font-display text-2xl font-bold text-foreground">
          Frequently asked questions
        </h2>
        <dl className="mt-4 space-y-5">
          {page.faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold text-foreground">{faq.question}</dt>
              <dd className="mt-1 text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
      <nav aria-label="Related" className="flex flex-wrap gap-3">
        {page.related.map((link) => (
          <Button key={link.path} variant="outline" asChild>
            <Link to={link.path}>{link.label}</Link>
          </Button>
        ))}
      </nav>
    </article>
  );
}
