import React from 'react';
import { Link } from 'react-router-dom';
import { LegalPageShell } from './LegalPageShell';

export const PrivacyPolicy: React.FC = () => {
  return (
    <LegalPageShell
      title="Privacy Policy"
      description="How SolomindLM collects, uses, and shares information when you use our notebooks, sources, AI features, and billing."
      canonical="/privacy"
    >
      <section className="space-y-3">
        <p className="text-muted-foreground">
          SolomindLM is operated from Canada. This Policy describes how we handle personal information when you use our websites and
          product. It works together with our{' '}
          <Link to="/terms" className="text-foreground underline underline-offset-2 hover:no-underline">
            Terms of Service
          </Link>
          . If you do not agree, please do not use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Information we collect</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Account and authentication</h3>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Email address and, if you use Google sign-in, basic profile details provided by Google.</li>
            <li>
              If you use email and password sign-in, we process your credentials through our auth system; verification and
              password-reset messages are sent via email.
            </li>
            <li>Session and security data needed to keep you signed in and protect accounts.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Content you provide</h3>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Files and URLs you add to notebooks, including text extracted or imported from those sources.</li>
            <li>
              Optional Google Drive imports: when you use the Drive picker or token flow, Google may share file identifiers
              and content needed to fetch files you select (read-only access you authorize).
            </li>
            <li>Chat messages, notes, and generated artifacts stored in your workspace (for example reports, flashcards, quizzes, mind maps, slides, spreadsheets, audio, and similar outputs).</li>
            <li>Notebook organization data (folders, titles, sharing or collaboration settings where available).</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Usage, device, and billing</h3>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Product usage signals needed to operate features, enforce limits, and improve reliability.</li>
            <li>Technical data such as browser type, approximate location derived from IP, and timestamps (typical of hosted web apps).</li>
            <li>Subscription status and payment metadata from our payment processor; we do not store full card numbers on our servers.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">How we use information</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Provide, secure, and troubleshoot the Service.</li>
          <li>Process and retrieve your sources for search, chat, and generation features.</li>
          <li>Manage accounts, subscriptions, and support requests.</li>
          <li>Comply with law and protect users, us, and the public.</li>
          <li>Understand aggregate usage and improve the product (including analytics as described below).</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Subprocessors and integrations</h2>
        <p className="text-muted-foreground">
          We use service providers that process data on our behalf. Their own policies also apply. Examples tied to the
          current product implementation include:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <span className="text-foreground">Convex</span> — backend database, auth tables, file storage, and server logic.
          </li>
          <li>
            <span className="text-foreground">Together AI</span> — large language model inference for chat and many generation flows.
          </li>
          <li>
            <span className="text-foreground">OpenAI</span> — text embeddings for search, text-to-speech for audio overviews, and image generation for slide visuals where that pipeline is used.
          </li>
          <li>
            <span className="text-foreground">ZeroEntropy</span> — optional reranking over retrieved passages for relevance.
          </li>
          <li>
            <span className="text-foreground">Mistral</span> — image and document text extraction (OCR) where that path is used.
          </li>
          <li>
            <span className="text-foreground">Supadata</span> — fetching and transcribing certain third-party links and media.
          </li>
          <li>
            <span className="text-foreground">Tavily</span> — web search and source discovery when those features run.
          </li>
          <li>
            <span className="text-foreground">Stripe</span> — payments and subscription management.
          </li>
          <li>
            <span className="text-foreground">Resend</span> — transactional email (sign-in codes, password reset, and similar messages).
          </li>
          <li>
            <span className="text-foreground">Google</span> — OAuth sign-in and Google APIs when you use Google login or Drive import.
          </li>
          <li>
            <span className="text-foreground">Vercel</span> — site hosting; the web app may load Vercel Analytics to collect privacy-oriented usage metrics.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Prompts, retrieved excerpts, and related text may be sent to model providers to generate responses. Do not submit
          secrets or data you are not allowed to share with subprocessors.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Security</h2>
        <p className="text-muted-foreground">
          We use HTTPS in the browser, access controls tied to your account, and provider-side protections appropriate to a
          hosted SaaS product. No method of transmission or storage is perfectly secure; we cannot guarantee absolute
          security.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Retention and your choices</h2>
        <p className="text-muted-foreground">
          We keep information while your account is active and for a limited period afterward for backups, legal compliance,
          and dispute resolution. You can delete many items inside the app (conversations, sources, notebooks, generated
          content) subject to product controls. You may request account deletion or other privacy requests by emailing us;
          we will respond within a reasonable time.
        </p>
        <p className="text-muted-foreground">
          Where the product offers export or download for a given artifact (for example certain generated materials), you may
          use those features to retrieve your content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Cookies, local storage, and analytics</h2>
        <p className="text-muted-foreground">
          We use cookies and similar technologies needed for authentication, preferences (such as theme), and basic app
          state. When enabled, Vercel Analytics may use cookies or local storage to measure page views and performance in a
          privacy-oriented way. We do not use third-party advertising cookies as part of this Policy&apos;s scope.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Children</h2>
        <p className="text-muted-foreground">
          The Service is not directed to children under 13, and we do not knowingly collect their personal information. If
          you believe we have, contact us and we will take appropriate steps.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Canadian privacy law</h2>
        <p className="text-muted-foreground">
          If you are in Canada, our collection, use, and disclosure of your personal information is subject to applicable
          Canadian privacy legislation, including the federal{' '}
          <span className="text-foreground">Personal Information Protection and Electronic Documents Act (PIPEDA)</span> where
          it applies, and substantially similar provincial laws where they apply instead of or alongside PIPEDA.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">International transfers</h2>
        <p className="text-muted-foreground">
          We are based in Canada, but we use service providers (for example hosting, AI, and payments) that may process or
          store data in Canada, the United States, and other countries. By using the Service, you understand your
          information may be transferred across borders where local laws may differ. We take steps described in this Policy
          to protect your information when we use those providers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Changes</h2>
        <p className="text-muted-foreground">
          We may update this Policy from time to time. We will post the new version on this page and adjust the &quot;Last
          updated&quot; date. For material changes, we may also notify you by email or in-product message where appropriate.
        </p>
      </section>

      <section className="space-y-3 border-t border-border pt-10">
        <h2 className="text-base font-semibold text-foreground">Contact</h2>
        <p className="text-muted-foreground">
          Privacy questions or requests:{' '}
          <a href="mailto:support@solomindlm.com" className="text-foreground underline underline-offset-2 hover:no-underline">
            support@solomindlm.com
          </a>
        </p>
      </section>
    </LegalPageShell>
  );
};
