import React from "react";
import { Link } from "react-router-dom";
import { LegalPageShell } from "./LegalPageShell";

export const PrivacyPolicy: React.FC = () => {
  return (
    <LegalPageShell title="Privacy Policy" canonical="/privacy">
      <section className="space-y-3">
        <p className="text-muted-foreground">
          SolomindLM is operated from Canada. This Policy describes how we handle personal
          information when you use our websites and product. It works together with our{" "}
          <Link
            to="/terms"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
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
            <li>
              Email address and, if you use Google sign-in, basic profile details provided by
              Google.
            </li>
            <li>
              If you use email and password sign-in, we process your credentials through our auth
              system; verification and password-reset messages are sent via email.
            </li>
            <li>Session and security data needed to keep you signed in and protect accounts.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Content you provide</h3>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              Files and URLs you add to notebooks, including text extracted or imported from those
              sources.
            </li>
            <li>
              Optional Google Drive imports: when you use the Drive picker or token flow, Google may
              share file identifiers and content needed to fetch files you select (read-only access
              you authorize).
            </li>
            <li>
              Chat messages, notes, and generated artifacts stored in your workspace (for example
              reports, flashcards, quizzes, mind maps, infographics, spreadsheets, audio overviews,
              written-question sets, literature tables, and literature review outputs).
            </li>
            <li>
              Research and discovery activity, such as search queries, literature review screening
              decisions, and bibliographic metadata from academic databases when you use those
              features.
            </li>
            <li>
              Notebook organization data (folders, titles, sharing or collaboration settings where
              available).
            </li>
            <li>
              Voice input you record in chat. The clip is sent for transcription and deleted once it
              has been transcribed; the resulting text is handled like any other chat message.
            </li>
            <li>
              Feedback and bug reports you send from the app, together with context such as the page
              you were on, your plan, and the app version.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Usage, device, and billing</h3>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              Product usage signals needed to operate features, enforce limits, and improve
              reliability.
            </li>
            <li>
              Technical data such as browser type, approximate location derived from IP, and
              timestamps (typical of hosted web apps).
            </li>
            <li>
              Subscription status and payment metadata from our payment processor; we do not store
              full card numbers on our servers.
            </li>
            <li>
              In the mobile app: a push notification token if you allow notifications, and crash,
              error, and performance reports (device model, operating system, app version, and
              diagnostic details; these reports are not tied to your name or email).
            </li>
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
          <li>
            Understand aggregate usage and improve the product (including analytics as described
            below).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Subprocessors and integrations</h2>
        <p className="text-muted-foreground">
          We use service providers that process data on our behalf. Their own policies also apply.
          Examples tied to the current product implementation include:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <span className="text-foreground">Convex</span> — backend database, auth tables, file
            storage, and server logic.
          </li>
          <li>
            <span className="text-foreground">Together AI</span> — large language model inference
            for chat and generation flows; text-to-speech for audio overviews; and speech-to-text
            for uploaded audio and voice input in chat (via hosted models on Together&apos;s
            platform).
          </li>
          <li>
            <span className="text-foreground">OpenAI</span> — text embeddings of your sources and
            questions for search and retrieval, and image generation for infographics.
          </li>
          <li>
            <span className="text-foreground">Voyage AI</span> — reranking retrieved passages for
            relevance in search and chat.
          </li>
          <li>
            <span className="text-foreground">Mistral</span> — optical character recognition (OCR)
            for PDFs, images, and some academic paper extraction paths.
          </li>
          <li>
            <span className="text-foreground">Supadata</span> — fetching web pages and transcripts
            from certain third-party links and media (for example YouTube and other supported
            platforms).
          </li>
          <li>
            <span className="text-foreground">Tavily</span> — web, news, and finance source
            discovery and search when those features run.
          </li>
          <li>
            <span className="text-foreground">OpenAlex, Semantic Scholar, PubMed, and arXiv</span> —
            academic paper metadata and discovery when you use literature review, deep research, or
            academic discover features (your search terms may be sent; returned data is generally
            public bibliographic information).
          </li>
          <li>
            <span className="text-foreground">Stripe</span> — payments and subscription management.
          </li>
          <li>
            <span className="text-foreground">Resend</span> — transactional email (sign-in codes,
            password reset, and similar messages).
          </li>
          <li>
            <span className="text-foreground">Google</span> — OAuth sign-in and Google APIs when you
            use Google login or Drive import.
          </li>
          <li>
            <span className="text-foreground">Vercel</span> — site hosting, plus Vercel Analytics
            and Speed Insights for usage and performance metrics.
          </li>
          <li>
            <span className="text-foreground">Cloudflare</span> — content delivery network and
            security proxy in front of our websites; it handles every request to the site, including
            your IP address and request details. We may also use Cloudflare Web Analytics to measure
            page views and performance.
          </li>
          <li>
            <span className="text-foreground">Google Analytics and Ahrefs Web Analytics</span> —
            website usage measurement (pages visited, referrers, approximate location, device and
            browser type).
          </li>
          <li>
            <span className="text-foreground">Expo</span> — delivering push notifications to the
            mobile app through Apple and Google push services.
          </li>
          <li>
            <span className="text-foreground">Sentry</span> — crash, error, and performance
            reporting for the mobile app.
          </li>
          <li>
            <span className="text-foreground">GitHub</span> — our team may file in-app feedback as
            an issue in our public GitHub repository. The issue contains the feedback text you wrote
            and the context listed above, but not your name or email address, so do not put personal
            information in feedback you do not want published.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Prompts, retrieved excerpts, and related text may be sent to model providers to generate
          responses. Do not submit secrets or data you are not allowed to share with subprocessors.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Security</h2>
        <p className="text-muted-foreground">
          We use HTTPS in the browser, access controls tied to your account, and provider-side
          protections appropriate to a hosted SaaS product. No method of transmission or storage is
          perfectly secure; we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Retention and your choices</h2>
        <p className="text-muted-foreground">
          We keep information while your account is active and for a limited period afterward for
          backups, legal compliance, and dispute resolution. You can delete many items inside the
          app (conversations, sources, notebooks, generated content) subject to product controls.
          You can delete your account at any time from the account menu in the app (Delete account).
          This permanently deletes your account and the content in it, and cancels any active
          subscription. Billing records our payment processor must retain are kept as required by
          law. For other privacy requests, email us; we will respond within a reasonable time.
        </p>
        <p className="text-muted-foreground">
          Where the product offers export or download for a given artifact (for example certain
          generated materials), you may use those features to retrieve your content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Cookies, local storage, and analytics
        </h2>
        <p className="text-muted-foreground">
          We use cookies and similar technologies needed for authentication, preferences (such as
          theme), and basic app state. Our websites also load Google Analytics, which sets cookies
          to measure visits, and Ahrefs Web Analytics, Vercel Analytics, and Cloudflare Web
          Analytics, which measure page views and performance. You can limit analytics cookies
          through your browser settings or by using Google&apos;s Analytics opt-out browser add-on.
          We do not use third-party advertising cookies as part of this Policy&apos;s scope.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Children</h2>
        <p className="text-muted-foreground">
          The Service is not directed to children under 13, and we do not knowingly collect their
          personal information. If you believe we have, contact us and we will take appropriate
          steps.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Canadian privacy law</h2>
        <p className="text-muted-foreground">
          If you are in Canada, our collection, use, and disclosure of your personal information is
          subject to applicable Canadian privacy legislation, including the federal{" "}
          <span className="text-foreground">
            Personal Information Protection and Electronic Documents Act (PIPEDA)
          </span>{" "}
          where it applies, and substantially similar provincial laws where they apply instead of or
          alongside PIPEDA.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">International transfers</h2>
        <p className="text-muted-foreground">
          We are based in Canada, but we use service providers (for example hosting, AI, and
          payments) that may process or store data in Canada, the United States, and other
          countries. By using the Service, you understand your information may be transferred across
          borders where local laws may differ. We take steps described in this Policy to protect
          your information when we use those providers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Changes</h2>
        <p className="text-muted-foreground">
          We may update this Policy from time to time. We will post the new version on this page and
          adjust the &quot;Last updated&quot; date. For material changes, we may also notify you by
          email or in-product message where appropriate.
        </p>
      </section>

      <section className="space-y-3 border-t border-border pt-10">
        <h2 className="text-base font-semibold text-foreground">Contact</h2>
        <p className="text-muted-foreground">
          Privacy questions or requests:{" "}
          <a
            href="mailto:support@solomindlm.com"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            support@solomindlm.com
          </a>
        </p>
      </section>
    </LegalPageShell>
  );
};
