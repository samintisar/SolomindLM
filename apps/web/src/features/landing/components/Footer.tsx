import React from "react";
import { Link } from "react-router-dom";
import { getIntentPagesByCluster } from "../intentLandingPages";
import { COMPARE_HUB_PATH, getComparisonPages, getGuidePages } from "../seoContentPages";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.754-1.333-1.754-1.089-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.775.418-1.305.762-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.469-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.005 2.045.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
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

const FOOTER_TAGLINE = "An AI study and research partner that works from the material you give it.";

const PRODUCT_LINKS = [
  { label: "Features", to: "/#features" },
  { label: "Pricing", to: "/#pricing" },
  { label: "FAQ", to: "/faq" },
] as const;

const LEGAL_LINKS = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
] as const;

const SOCIAL_LINKS = [
  { label: "GitHub", href: "https://github.com/samintisar/SolomindLM", Icon: GitHubIcon },
  { label: "X", href: "https://twitter.com/solomindlm", Icon: XIcon },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/solomindlm/", Icon: LinkedInIcon },
] as const;

function FooterLinkColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <h3 className="mb-4 font-display text-sm font-bold text-foreground">{title}</h3>
      <ul className="space-y-2.5">{children}</ul>
    </nav>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="font-sans text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
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
  const comparisonPages = getComparisonPages();
  const guidePages = getGuidePages();

  return (
    <footer className="border-t border-border/50 px-6 pt-16 pb-10">
      <div className="mx-auto max-w-280">
        <div className="flex flex-col gap-6 border-b border-border/50 pb-10 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 font-display text-lg font-bold text-foreground"
            >
              <img src="/SolomindLM_logo.png" alt="" className="size-8 shrink-0 object-contain" />
              SolomindLM
            </Link>
            <p className="mt-4 max-w-sm font-serif text-sm leading-relaxed text-muted-foreground">
              {FOOTER_TAGLINE}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="size-5" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-10 md:grid-cols-3 lg:grid-cols-5">
          <FooterLinkColumn title="Product">
            {PRODUCT_LINKS.map((link) => (
              <FooterLink key={link.to} to={link.to}>
                {link.label}
              </FooterLink>
            ))}
          </FooterLinkColumn>

          <FooterLinkColumn title="For students">
            <FooterLink to="/students">All student tools</FooterLink>
            {studentPages.map((page) => (
              <FooterLink key={page.path} to={page.path}>
                {page.navLabel}
              </FooterLink>
            ))}
          </FooterLinkColumn>

          <FooterLinkColumn title="For research">
            <FooterLink to="/research">All research tools</FooterLink>
            {researchPages.map((page) => (
              <FooterLink key={page.path} to={page.path}>
                {page.navLabel}
              </FooterLink>
            ))}
          </FooterLinkColumn>

          <FooterLinkColumn title="Compare">
            <FooterLink to={COMPARE_HUB_PATH}>All comparisons</FooterLink>
            {comparisonPages.map((page) => (
              <FooterLink key={page.path} to={page.path}>
                {page.navLabel}
              </FooterLink>
            ))}
          </FooterLinkColumn>

          <FooterLinkColumn title="Company">
            {guidePages.map((page) => (
              <FooterLink key={page.path} to={page.path}>
                {page.navLabel}
              </FooterLink>
            ))}
            {LEGAL_LINKS.map((link) => (
              <FooterLink key={link.to} to={link.to}>
                {link.label}
              </FooterLink>
            ))}
          </FooterLinkColumn>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-border/50 pt-8 font-sans text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>Copyright &copy; {currentYear} SolomindLM. All rights reserved.</p>
          <p>Made for people who'd rather understand it.</p>
        </div>
      </div>
    </footer>
  );
};
