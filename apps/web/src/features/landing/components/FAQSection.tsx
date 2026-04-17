import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { LANDING_FAQS } from "../constants";

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      <section id="faq" className="py-32 md:py-40 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about SolomindLM
            </p>
          </div>

          {/* FAQ List */}
          <div className="space-y-4">
            {LANDING_FAQS.map((faq, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 hover:shadow-md"
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-accent/50 transition-colors"
                  aria-expanded={openIndex === index}
                >
                  <span className="font-semibold text-foreground pr-4">{faq.question}</span>
                  {openIndex === index ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openIndex === index ? "max-h-96 opacity-100 pb-5" : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="px-6 text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Still Have Questions CTA */}
          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">Still have questions?</p>
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => {
                // Open contact form or email
                window.location.href = "mailto:support@solomindlm.com";
              }}
            >
              Contact Support
            </Button>
          </div>
        </div>
      </section>
    </>
  );
};
