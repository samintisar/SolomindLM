import React from "react";
import { Link } from "react-router-dom";
import { LegalPageShell } from "./LegalPageShell";

export const TermsOfService: React.FC = () => {
  return (
    <LegalPageShell
      title="Terms of Service"
      description="Terms that apply when you use SolomindLM’s AI research notebooks, sources, chat, and study tools."
      canonical="/terms"
    >
      <section className="space-y-3">
        <p className="text-muted-foreground">
          By creating an account or using SolomindLM (&quot;the Service&quot;), you agree to these
          Terms and our{" "}
          <Link
            to="/privacy"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Privacy Policy
          </Link>
          . If you disagree, do not use the Service. We may update these Terms; continued use after
          changes means you accept the updated Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">The Service</h2>
        <p className="text-muted-foreground">
          SolomindLM helps you organize research in notebooks, add sources (files, links, and
          optional Google Drive imports where enabled), chat with retrieval over your materials, and
          generate study-style outputs (for example reports, flashcards, quizzes, mind maps, slides,
          spreadsheets, audio overviews, and similar tools). Features may change, and we may suspend
          or discontinue parts of the Service.
        </p>
        <p className="text-muted-foreground">
          Where we offer collaboration or sharing, you are responsible for only sharing content you
          are allowed to share and for how recipients use shared access.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Accounts</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>You must be at least 13 years old to use the Service.</li>
          <li>
            You may sign in with Google or with email and password. Email-based flows may use
            one-time codes or links sent to your address.
          </li>
          <li>Keep your credentials secure and notify us if you suspect unauthorized access.</li>
          <li>You are responsible for activity under your account.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Subscriptions and billing</h2>
        <p className="text-muted-foreground">
          We may offer free and paid plans. Paid subscriptions are billed through Stripe on the
          terms shown at checkout. Unless required by law, fees are generally non-refundable. You
          can cancel according to in-product controls; cancellation typically takes effect at the
          end of the current billing period. We may change prices with reasonable notice where
          required.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Acceptable use</h2>
        <p className="text-muted-foreground">You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Violate law or others&apos; rights, including intellectual property and privacy.</li>
          <li>Upload malware, probe or break security, or bypass limits or access controls.</li>
          <li>Use the Service to generate or facilitate illegal, abusive, or harmful content.</li>
          <li>
            Scrape, overload, or automate the Service in a way that harms its operation or other
            users.
          </li>
        </ul>
        <p className="text-muted-foreground">
          We may suspend or terminate accounts that violate these rules.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Your content</h2>
        <p className="text-muted-foreground">
          You keep ownership of content you submit. You give us permission to host, process, and
          display it as needed to run the Service (including sending portions to subprocessors
          described in our Privacy Policy). You represent you have the rights to submit that
          content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">AI-generated output</h2>
        <p className="text-muted-foreground">
          Outputs may be wrong, incomplete, or outdated. They are informational aids, not
          professional advice. You are responsible for how you use them, including verifying
          important facts.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Our rights</h2>
        <p className="text-muted-foreground">
          The Service, its software, and our branding are owned by us or our licensors. Do not copy
          or misuse them except as allowed by these Terms or law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Disclaimers</h2>
        <p className="text-muted-foreground">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, TO THE MAXIMUM
          EXTENT PERMITTED BY LAW. We do not guarantee uninterrupted or error-free operation. We do
          not endorse third-party sources you import.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Limitation of liability</h2>
        <p className="text-muted-foreground">
          To the maximum extent permitted by law, we are not liable for indirect, incidental,
          special, consequential, or punitive damages, or for loss of data, profits, or goodwill.
          Our total liability for a claim is limited to the greater of (a) amounts you paid for the
          Service in the twelve months before the claim or (b) one hundred Canadian dollars (CAD
          $100), except where law does not allow this cap.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Termination</h2>
        <p className="text-muted-foreground">
          You may stop using the Service at any time. We may suspend or terminate access for
          violations, risk, legal requirements, or prolonged inactivity, with or without notice
          where allowed. When access ends, we may delete data according to our Privacy Policy and
          retention practices.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Governing law and disputes</h2>
        <p className="text-muted-foreground">
          SolomindLM is operated from Canada. These Terms are governed by the laws of Canada and the
          laws of the province or territory in which we operate, without regard to conflict-of-law
          rules that would apply another jurisdiction&apos;s laws. Disputes should first be
          addressed by contacting us. Where formal resolution is needed, you and we submit to the
          non-exclusive jurisdiction of the courts of that province or territory, except that
          mandatory consumer protection rules in your own province, territory, or country may still
          apply to you where the law requires.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Indemnity</h2>
        <p className="text-muted-foreground">
          You will defend and indemnify us and our affiliates, officers, and agents against
          third-party claims arising from your use of the Service, your content, or your breach of
          these Terms, to the extent permitted by law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">General</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>These Terms and the Privacy Policy are the entire agreement on this subject.</li>
          <li>If a provision is unenforceable, the rest remains in effect.</li>
          <li>We may assign the Service; you may not assign these Terms without our consent.</li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-border pt-10">
        <h2 className="text-base font-semibold text-foreground">Contact</h2>
        <p className="text-muted-foreground">
          Questions about these Terms:{" "}
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
