import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { LEGAL_LAST_UPDATED } from "../legalMeta";

type LegalPageShellProps = {
  title: string;
  description: string;
  canonical: "/terms" | "/privacy";
  children: ReactNode;
};

export function LegalPageShell({ title, description, canonical, children }: LegalPageShellProps) {
  const other =
    canonical === "/terms"
      ? { href: "/privacy", label: "Privacy Policy" }
      : { href: "/terms", label: "Terms of Service" };

  return (
    <>
      <SEOMeta title={`${title} - SolomindLM`} description={description} canonical={canonical} />
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              Home
            </Link>
            <Link
              to={other.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {other.label}
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-5 py-10 md:py-14">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
          <div className="mt-10 space-y-10 text-sm leading-relaxed md:text-[15px]">{children}</div>
        </main>
      </div>
    </>
  );
}
