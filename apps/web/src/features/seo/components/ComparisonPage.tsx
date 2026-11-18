import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Check, X, ArrowRight } from "lucide-react";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { generateFAQStructuredData } from "@/shared/seo/structuredData";

interface ComparisonFeature {
  feature: string;
  solomindlm: string | boolean;
  competitor: string | boolean;
}

interface ComparisonPageProps {
  title: string;
  description: string;
  competitorName: string;
  headline: React.ReactNode;
  subheadline: string;
  answerFirst: string;
  features: ComparisonFeature[];
  faqs: Array<{ question: string; answer: string }>;
  canonical: string;
  onGetStarted: () => void;
}

export const ComparisonPage: React.FC<ComparisonPageProps> = ({
  title,
  description,
  competitorName,
  headline,
  subheadline,
  answerFirst,
  features,
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
                Get Started Free
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

      {/* Comparison Table */}
      <section className="py-24 px-6">
        <div className="max-w-[1500px] w-full mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Feature Comparison
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              See how SolomindLM stacks up against {competitorName}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl mx-auto border-collapse">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="text-left py-4 px-6 font-display font-bold text-foreground text-lg w-1/3">
                    Feature
                  </th>
                  <th className="text-center py-4 px-6 font-display font-bold text-foreground text-lg w-1/3">
                    <span
                      style={{
                        background: "linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fb7185 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      SolomindLM
                    </span>
                  </th>
                  <th className="text-center py-4 px-6 font-display font-bold text-muted-foreground text-lg w-1/3">
                    {competitorName}
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((item, index) => (
                  <tr
                    key={index}
                    className="border-b border-border hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-4 px-6 text-foreground font-medium">
                      {item.feature}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {typeof item.solomindlm === "boolean" ? (
                        item.solomindlm ? (
                          <Check className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-6 h-6 text-red-500 mx-auto" />
                        )
                      ) : (
                        <span className="text-green-600 font-semibold">{item.solomindlm}</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {typeof item.competitor === "boolean" ? (
                        item.competitor ? (
                          <Check className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-6 h-6 text-red-500 mx-auto" />
                        )
                      ) : (
                        <span className="text-muted-foreground">{item.competitor}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-muted/30">
        <div className="max-w-[1500px] w-full mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Ready to Upgrade Your Learning?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Join thousands of students and researchers who have switched to SolomindLM
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
      <section className="py-24 px-6">
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
