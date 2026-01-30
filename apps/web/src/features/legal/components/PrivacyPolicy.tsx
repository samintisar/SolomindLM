import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, Database, Lock, Cookie, Trash2 } from 'lucide-react';
import { SEOMeta } from '@/shared/seo/SEOMeta';

export const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOMeta
        title="Privacy Policy - SolomindLM"
        description="Learn how SolomindLM protects your data and privacy. We're GDPR compliant, encrypt your content, and never sell your data to third parties."
        canonical="/privacy"
      />
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
            Privacy Policy
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
            <p className="text-lg text-muted-foreground leading-relaxed">
              At SolomindLM, we take your privacy seriously. This Privacy Policy explains how we collect,
              use, disclose, and safeguard your information when you use our AI-powered research platform.
              Please read this policy carefully. If you do not agree with the terms of this policy,
              please do not access the platform.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Information We Collect
              </h2>
            </div>

            <div className="space-y-6">
              {/* Account Information */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Account Information
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Email address (used as your primary identifier)</li>
                  <li>• User ID and authentication tokens</li>
                  <li>• Google OAuth information (if you sign in with Google)</li>
                  <li>• Profile preferences (theme settings)</li>
                </ul>
              </div>

              {/* Content You Upload */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Content You Upload
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Documents and files (PDFs, text files, images, audio files)</li>
                  <li>• URLs and web content you import (including transcripts from YouTube, TikTok, Instagram, X/Twitter)</li>
                  <li>• Chat messages and conversation history</li>
                  <li>• Notes, notebooks, and organizational structures</li>
                  <li>• Generated content (reports, flashcards, quizzes, mind maps, audio overviews)</li>
                </ul>
              </div>

              {/* Usage Information */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Usage Information
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Feature usage patterns and interactions</li>
                  <li>• Device and browser information</li>
                  <li>• Session data and authentication activity</li>
                  <li>• Subscription and billing information</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                How We Use Your Information
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex gap-3">
                  <span className="text-primary font-semibold">•</span>
                  <span><strong>Provide Services:</strong> To deliver the AI-powered research, content analysis, and generation features you use</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary font-semibold">•</span>
                  <span><strong>Process Content:</strong> To analyze, embed, and retrieve information from your uploaded content using our AI services</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary font-semibold">•</span>
                  <span><strong>Maintain Accounts:</strong> To authenticate users, manage subscriptions, and provide customer support</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary font-semibold">•</span>
                  <span><strong>Improve Services:</strong> To enhance our platform's functionality, performance, and user experience</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary font-semibold">•</span>
                  <span><strong>Process Payments:</strong> To handle subscription billing and related transactions</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary font-semibold">•</span>
                  <span><strong>Communicate:</strong> To send you important updates about your account and our services</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Third-Party Services */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Third-Party Services & Data Processors
              </h2>
            </div>

            <p className="text-muted-foreground mb-6">
              We use the following third-party services to power our platform. Your data may be processed
              by these services according to their respective privacy policies:
            </p>

            <div className="grid gap-4">
              {/* AI Services */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">AI & Content Processing</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• <strong>Cohere:</strong> Vector embeddings and text reranking</li>
                  <li>• <strong>Together AI:</strong> Large language model responses and content generation</li>
                  <li>• <strong>Mistral AI:</strong> Image text extraction (OCR)</li>
                  <li>• <strong>Deepgram:</strong> Text-to-speech audio generation</li>
                </ul>
              </div>

              {/* Infrastructure */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Infrastructure & Data Storage</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• <strong>Convex:</strong> Backend, database, authentication, and file storage</li>
                  <li>• <strong>Supadata:</strong> Video transcription and web scraping</li>
                  <li>• <strong>Tavily:</strong> Web search and source discovery</li>
                </ul>
              </div>

              {/* Payment */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Payment Processing</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• <strong>Stripe:</strong> Secure payment processing and subscription management</li>
                </ul>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-foreground">
                  <strong>Important:</strong> Your content is sent to and processed by these AI services to provide our features.
                  Please review their privacy policies to understand how they handle your data.
                </p>
              </div>
            </div>
          </section>

          {/* Data Security */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Data Security
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Secure HTTPS/TLS encryption for all data transmissions</li>
                <li>• Encrypted password storage using industry best practices</li>
                <li>• JWT-based authentication with automatic token refresh</li>
                <li>• Input validation and sanitization to prevent attacks</li>
                <li>• Rate limiting and request size restrictions</li>
                <li>• Regular security updates and monitoring</li>
              </ul>
            </div>
          </section>

          {/* Data Retention & Deletion */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Data Retention & Your Rights
              </h2>
            </div>

            <div className="space-y-6">
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Data Retention</h3>
                <p className="text-muted-foreground mb-3">
                  We retain your data for the duration of your account and for a reasonable period thereafter
                  for legal, operational, and backup purposes:
                </p>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• <strong>Chat history:</strong> Stored indefinitely while your account is active</li>
                  <li>• <strong>Documents & sources:</strong> Kept until you delete them or close your account</li>
                  <li>• <strong>Generated content:</strong> Stored permanently unless deleted</li>
                  <li>• <strong>Account data:</strong> Retained as long as your account exists</li>
                </ul>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Your Rights</h3>
                <p className="text-muted-foreground mb-3">
                  You have the following rights regarding your personal information:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• <strong>Access:</strong> View all your data through the application interface</li>
                  <li>• <strong>Delete:</strong> Remove individual conversations, documents, notes, or notebooks</li>
                  <li>• <strong>Export:</strong> Download your content (feature coming soon)</li>
                  <li>• <strong>Account Deletion:</strong> Request complete deletion of your account and all associated data</li>
                  <li>• <strong>Opt-out:</strong> Unsubscribe from marketing communications at any time</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-4">
                  To exercise these rights, please contact us at the email address provided below.
                </p>
              </div>
            </div>
          </section>

          {/* Cookies & Tracking */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Cookie className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                Cookies & Local Storage
              </h2>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                We use local storage and browser-based technologies to:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• <strong>Authentication:</strong> Store your session tokens for seamless access</li>
                <li>• <strong>Preferences:</strong> Remember your theme and interface settings</li>
                <li>• <strong>Functionality:</strong> Maintain application state during your session</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-4">
                We do not currently use third-party tracking or advertising cookies.
              </p>
            </div>
          </section>

          {/* Children's Privacy */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              Children's Privacy
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground">
                Our platform is not intended for children under the age of 13. We do not knowingly collect
                personal information from children under 13. If you are a parent or guardian and believe
                your child has provided us with personal information, please contact us immediately.
              </p>
            </div>
          </section>

          {/* International Users */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              International Data Transfers
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground">
                Your information may be transferred to and processed in countries other than your own.
                We take appropriate safeguards to ensure your data remains protected in accordance with
                this Privacy Policy. By using our platform, you consent to such international transfers.
              </p>
            </div>
          </section>

          {/* Changes to Policy */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              Changes to This Policy
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of any material
                changes by posting the new policy on this page and updating the "Last updated" date.
                We encourage you to review this policy periodically.
              </p>
            </div>
          </section>

          {/* Contact Us */}
          <section className="mb-12">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
              Contact Us
            </h2>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground mb-4">
                If you have any questions, concerns, or requests regarding this Privacy Policy or our
                data practices, please contact us:
              </p>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-foreground font-semibold mb-2">SolomindLM</p>
                <p className="text-muted-foreground">
                  Email: support@solomindlm.com
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  We will respond to your inquiry within 30 days.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
    </>
  );
};
