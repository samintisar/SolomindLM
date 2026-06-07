import React from "react";
import { Link } from "react-router-dom";
import { getIntentPagesByCluster } from "../intentLandingPages";

const FOOTER_TAGLINE =
  "SolomindLM is an AI learning and research assistant that helps you work with PDFs, videos, and papers—flashcards, quizzes, reports, chat, and more, starting from the material you upload.";

const COMPANY_LINKS = [
  { label: "Features", to: "/#features" },
  { label: "Pricing", to: "/#pricing" },
  { label: "FAQ", to: "/faq" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
] as const;

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function FooterLinkColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <h3 className="text-[15px] font-display font-semibold text-foreground mb-5">{title}</h3>
      <ul className="space-y-3">{children}</ul>
    </nav>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors leading-snug"
      >
        {children}
      </Link>
    </li>
  );
}

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const studentPages = getIntentPagesByCluster("students");
  const researchPages = getIntentPagesByCluster("research");

  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="max-w-[1500px] w-full mx-auto px-6 sm:px-8 lg:px-12 pt-16 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-10">
          <div className="sm:col-span-2 lg:col-span-4">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-5">
              <img
                src="/SolomindLM_logo.png"
                alt="SolomindLM"
                className="w-8 h-8 shrink-0 object-contain"
              />
              <span className="text-xl font-display font-bold text-foreground tracking-tight">
                SolomindLM
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-6">
              {FOOTER_TAGLINE}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://discord.gg/solomindlm"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <DiscordIcon className="w-5 h-5" />
              </a>
              <a
                href="https://twitter.com/solomindlm"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </a>
              <a
                href="https://www.linkedin.com/company/solomindlm/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <LinkedInIcon className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-2">
            <FooterLinkColumn title="Company">
              {COMPANY_LINKS.map((link) => (
                <FooterLink key={link.to} to={link.to}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>

          <div className="lg:col-span-3">
            <FooterLinkColumn title="For Students">
              <FooterLink to="/students">All student tools</FooterLink>
              {studentPages.map((page) => (
                <FooterLink key={page.path} to={page.path}>
                  {page.navLabel}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>

          <div className="lg:col-span-3">
            <FooterLinkColumn title="For Research">
              <FooterLink to="/research">All research tools</FooterLink>
              {researchPages.map((page) => (
                <FooterLink key={page.path} to={page.path}>
                  {page.navLabel}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-border/60 text-center">
          <p className="text-sm text-muted-foreground">
            Copyright &copy; {currentYear} SolomindLM. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
