import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, AlertCircle, Shield, CreditCard, Ban, Gavel } from 'lucide-react';

export const TermsOfService: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <span>←</span> Back to Home
          </button>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">
            Terms of Service
          </h1>
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="prose prose-lg max-w-none">
          {/* Introduction */}
          <section className="mb-12">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 mb-6">
              <p className="text-sm text-primary font-medium">
                Please read these Terms of Service carefully before using SolomindLM. By accessing or
                using our platform, you agree to be bound by these terms. If you do not agree to these
                terms, please do not use our service.
              </p>
            </div>
          </section>

          {/* 1. Acceptance of Terms */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                1. Acceptance of Terms
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                By creating an account, accessing, or using SolomindLM ("the Service"), you agree to be
                bound by these Terms of Service and all applicable laws and regulations. If you do not
                agree with any of these terms, you are prohibited from using the Service.
              </p>
              <p className="text-muted-foreground">
                These terms constitute a legally binding agreement between you and SolomindLM. We reserve
                the right to modify these terms at any time, and your continued use of the Service after
                such modifications constitutes your acceptance of the updated terms.
              </p>
            </div>
          </section>

          {/* 2. Description of Service */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                2. Description of Service
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                SolomindLM is an AI-powered research platform that provides:
              </p>
              <ul className="space-y-2 text-muted-foreground mb-4">
                <li>• Content ingestion from documents, websites, and social media platforms</li>
                <li>• AI-powered chat with citation support (RAG-based)</li>
                <li>• Automated content generation (reports, flashcards, quizzes, mind maps, audio overviews)</li>
                <li>• Notebook organization and management</li>
                <li>• Research tools and educational features</li>
              </ul>
              <p className="text-muted-foreground">
                We reserve the right to modify, suspend, or discontinue any aspect of the Service at any
                time without prior notice.
              </p>
            </div>
          </section>

          {/* 3. User Accounts */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                3. User Accounts & Responsibilities
              </h2>
            </div>

            <div className="space-y-4">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Account Creation</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• You must be at least 13 years old to create an account</li>
                  <li>• You must provide accurate and complete information</li>
                  <li>• You are responsible for maintaining the security of your account credentials</li>
                  <li>• You are responsible for all activities that occur under your account</li>
                  <li>• You must notify us immediately of any unauthorized use of your account</li>
                </ul>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">User Responsibilities</h3>
                <p className="text-muted-foreground mb-3">As a user of SolomindLM, you agree to:</p>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Use the Service only for lawful purposes</li>
                  <li>• Not upload malicious or harmful content</li>
                  <li>• Not attempt to gain unauthorized access to our systems</li>
                  <li>• Not use automated tools to abuse the Service</li>
                  <li>• Respect the intellectual property rights of others</li>
                  <li>• Not impersonate any person or entity</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. Subscription & Payment */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                4. Subscription & Payment Terms
              </h2>
            </div>

            <div className="space-y-4">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Free Tier</h3>
                <p className="text-muted-foreground mb-3">
                  SolomindLM offers a free tier with limited features and usage limits. Free tier
                  features are subject to change at any time.
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Paid Subscriptions</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Paid subscriptions are billed monthly or yearly as selected during checkout</li>
                  <li>• Subscription fees are non-refundable except as required by law</li>
                  <li>• You may cancel your subscription at any time through your account settings</li>
                  <li>• Cancellation takes effect at the end of the current billing period</li>
                  <li>• We reserve the right to change pricing with 30 days notice to existing subscribers</li>
                </ul>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Payment Processing</h3>
                <p className="text-muted-foreground">
                  Payments are processed through Stripe. By subscribing, you authorize us to charge your
                  selected payment method for the subscription fee. You agree to provide accurate, current,
                  and complete payment information.
                </p>
              </div>
            </div>
          </section>

          {/* 5. Acceptable Use Policy */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Ban className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                5. Acceptable Use Policy
              </h2>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-3">
                Prohibited Activities
              </h3>
              <p className="text-red-700 dark:text-red-300 mb-3">
                You agree NOT to use the Service to:
              </p>
              <ul className="space-y-2 text-red-700 dark:text-red-300 text-sm">
                <li>• Violate any applicable laws or regulations</li>
                <li>• Infringe on intellectual property rights of others</li>
                <li>• Upload viruses, malware, or malicious code</li>
                <li>• Harass, abuse, or harm other users</li>
                <li>• Generate harmful, illegal, or inappropriate content</li>
                <li>• Reverse engineer or attempt to extract our AI models</li>
                <li>• Use the Service to compete with SolomindLM</li>
                <li>• Circumvent usage limits or access controls</li>
                <li>• Spam or send unsolicited communications</li>
                <li>• Exploit vulnerabilities in the Service</li>
              </ul>
            </div>

            <p className="text-muted-foreground">
              We reserve the right to suspend or terminate accounts that violate these terms without
              prior notice.
            </p>
          </section>

          {/* 6. Content & Intellectual Property */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                6. Content & Intellectual Property
              </h2>
            </div>

            <div className="space-y-4">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Your Content</h3>
                <p className="text-muted-foreground mb-3">
                  You retain ownership of content you upload to SolomindLM. By uploading content, you grant
                  us a license to process, store, and use it solely to provide the Service to you.
                </p>
                <p className="text-muted-foreground">
                  You represent and warrant that you have the right to upload all content and that it does
                  not infringe on the rights of any third party.
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">AI-Generated Content</h3>
                <p className="text-muted-foreground mb-3">
                  AI-generated content (reports, flashcards, quizzes, summaries, chat responses, etc.) is
                  provided for informational and educational purposes only.
                </p>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• AI-generated content may not be accurate, complete, or current</li>
                  <li>• You are responsible for verifying any AI-generated information</li>
                  <li>• We do not guarantee the suitability of AI content for any specific purpose</li>
                  <li>• You should not rely solely on AI-generated content for important decisions</li>
                </ul>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Our Intellectual Property</h3>
                <p className="text-muted-foreground">
                  The Service, including all technology, software, designs, features, and content
                  (excluding your content), is owned by SolomindLM and protected by intellectual property
                  laws. You may not copy, modify, or distribute our proprietary materials without permission.
                </p>
              </div>
            </div>
          </section>

          {/* 7. Disclaimers & Warranties */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                7. Disclaimers & Warranties
              </h2>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-3">
                Important Disclaimers
              </h3>
              <ul className="space-y-2 text-yellow-800 dark:text-yellow-200 text-sm">
                <li>• THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND</li>
                <li>• We do not guarantee uninterrupted or error-free operation</li>
                <li>• AI-generated content may be inaccurate, incomplete, or misleading</li>
                <li>• We are not responsible for any decisions made based on Service content</li>
                <li>• Educational content is not a substitute for professional advice</li>
                <li>• We do not endorse or verify third-party content you import</li>
                <li>• Features and functionality may change without notice</li>
              </ul>
            </div>
          </section>

          {/* 8. Limitation of Liability */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Gavel className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                8. Limitation of Liability
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                To the maximum extent permitted by law, SolomindLM shall not be liable for:
              </p>
              <ul className="space-y-2 text-muted-foreground mb-4">
                <li>• Any indirect, incidental, special, or consequential damages</li>
                <li>• Loss of data, profits, revenue, or business opportunities</li>
                <li>• Damages from errors, omissions, or inaccuracies in AI-generated content</li>
                <li>• Damages from service interruptions or unavailability</li>
                <li>• Actions taken based on information provided through the Service</li>
              </ul>
              <p className="text-muted-foreground">
                Our total liability shall not exceed the amount you paid for the Service in the twelve
                (12) months preceding the claim, or $100, whichever is greater.
              </p>
            </div>
          </section>

          {/* 9. Termination */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Ban className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                9. Termination
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                We reserve the right to suspend or terminate your account at any time, with or without
                cause, with or without notice.
              </p>
              <p className="text-muted-foreground mb-3">Grounds for termination include, but are not limited to:</p>
              <ul className="space-y-2 text-muted-foreground text-sm mb-4">
                <li>• Violation of these Terms of Service</li>
                <li>• Abuse of the Service or other users</li>
                <li>• Fraudulent or illegal activities</li>
                <li>• Account inactivity for an extended period</li>
              </ul>
              <p className="text-muted-foreground">
                Upon termination, your right to use the Service immediately ceases. We may delete your
                account data and content in accordance with our retention policies.
              </p>
            </div>
          </section>

          {/* 10. Governing Law */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Gavel className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                10. Governing Law & Dispute Resolution
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                These terms shall be governed by and construed in accordance with applicable laws.
                Any disputes arising under these terms shall be resolved through good faith negotiations.
              </p>
              <p className="text-muted-foreground">
                If formal dispute resolution becomes necessary, you agree to submit to the jurisdiction of
                the appropriate courts.
              </p>
            </div>
          </section>

          {/* 11. Indemnification */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              11. Indemnification
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground">
                You agree to indemnify and hold harmless SolomindLM, its officers, directors, employees,
                and agents from any claims, damages, losses, liabilities, and expenses arising from:
                (a) your use of the Service; (b) your violation of these terms; (c) your violation of
                any rights of another; or (d) content you upload or create using the Service.
              </p>
            </div>
          </section>

          {/* 12. General Provisions */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              12. General Provisions
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <ul className="space-y-3 text-muted-foreground">
                <li>• <strong>Entire Agreement:</strong> These terms constitute the entire agreement between you and SolomindLM</li>
                <li>• <strong>Severability:</strong> If any provision is found invalid, the remaining provisions remain in full force</li>
                <li>• <strong>Waiver:</strong> Failure to enforce any provision does not constitute a waiver</li>
                <li>• <strong>Assignment:</strong> You may not assign these terms without our consent</li>
                <li>• <strong>Force Majeure:</strong> We are not liable for delays beyond our reasonable control</li>
              </ul>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              Contact Us
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-foreground font-semibold mb-2">SolomindLM</p>
                <p className="text-muted-foreground">
                  Email: legal@solomindlm.com
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  We will respond to your inquiry within 30 days.
                </p>
              </div>
            </div>
          </section>

          {/* Agreement Notice */}
          <section>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
              <p className="text-sm text-primary font-medium text-center">
                By continuing to use SolomindLM, you acknowledge that you have read, understood,
                and agree to be bound by these Terms of Service and our Privacy Policy.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
