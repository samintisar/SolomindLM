import React from "react";
import { Button } from "@/shared/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { generateFAQStructuredData } from "@/shared/seo/structuredData";

interface ToolPageProps {
  title: string;
  description: string;
  headline: React.ReactNode;
  subheadline: string;
  answerFirst: string;
  features: string[];
  howItWorks: Array<{ title: string; description: string }>;
  faqs: Array<{ question: string; answer: string }>;
  canonical: string;
  onGetStarted: () => void;
}

export const ToolPage: React.FC<ToolPageProps> = ({
  title,
  description,
  headline,
  subheadline,
  answerFirst,
  features,
  howItWorks,
  faqs,
  canonical,
  onGetStarted,
}) => {
  return (
    <div className="min-h-screen bg-background">
      <SEOMeta
        title={title}
        description={description}
        canonical={canonical}
        structuredData={[generateFAQStructuredData(faqs)]}
      />

      {/* Hero Section */}
      <section className="relative flex flex-col items-center px-6 sm:px-8 lg:px-12 pt-32 sm:pt-36 pb-16 sm:pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          <div
            className="absolute inset-0 opacity-[0.25]"
            style={{
              background: `
                radial-gradient(ellipse 80% 50% at 20% 40%, rgba(249, 115, 22, 0.15), transparent),
                radial-gradient(ellipse 90% 55% at 85% 55%, rgba(251, 191, 36, 0.12), transparent),
                radial-gradient(ellipse 100% 70% at 100% 50%, rgba(251, 113, 133, 0.08), transparent)
              `,
            }}
          />
        </div>

        <div className="relative z-10 max-w-[1500px] w-full mx-auto text-center px-4 sm:px-6">
          <div className="space-y-5 sm:space-y-6">
            <h1
              className="text-5xl md:text-7xl font-display font-extrabold text-foreground tracking-tight"
              style={{ lineHeight: "1.1" }}
            >
              {headline}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-display font-light leading-relaxed max-w-3xl mx-auto">
              {subheadline}
            </p>
            <div className="pt-2">
              <Button
                onClick={onGetStarted}
                className="font-sans bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold px-8 py-3 text-base transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
              >
                Try It Free
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Answer-First Content */}
      <section className="py-16 px-6 bg-muted/30">
        <div className="max-w-[1500px] w-full mx-auto">
          <div className="max-w-4xl mx-auto">
            <p className="text-xl text-foreground leading-relaxed">
              {answerFirst}
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6">
        <div className="max-w-[1500px] w-full mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Key Features
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-card border border-border rounded-xl p-6"
              >
                <Check className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-foreground font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 bg-muted/30">
        <div className="max-w-[1500px] w-full mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              How It Works
            </h2>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              {howItWorks.map((step, index) => (
                <div key={index} className="flex gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{index + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold text-foreground mb-2">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-[1500px] w-full mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Start Creating Today
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Join thousands of students and professionals using AI to learn faster
          </p>
          <Button
            onClick={onGetStarted}
            className="font-sans bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold px-8 py-3 text-base transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
          >
            Get Started Free <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6 bg-muted/30">
        <div className="max-w-[1500px] w-full mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="max-w-3xl mx-auto space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-display font-bold text-foreground mb-2">
                  {faq.question}
                </h3>
                <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
