import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

export interface FAQItem {
  question: string;
  answer: string;
}

export const LANDING_FAQS: FAQItem[] = [
  {
    question: "How accurate is the AI-generated content?",
    answer: "All generated content is grounded directly in your uploaded sources—whether it's a PDF, article, or video—rather than relying solely on general knowledge. This means the chances of AI hallucinations are extremely low, ensuring the flashcards, quizzes, and summaries accurately reflect your original materials."
  },
  {
    question: "What languages are supported?",
    answer: "Currently, we're focusing on English content with full official support. We're actively working on expanding to other popular languages including Spanish, French, German, Chinese, Japanese, and Korean. Coming soon, you'll be able to process content in one language and generate study materials in another."
  },
  {
    question: "Can I export my flashcards and study materials?",
    answer: "Yes! You can export your flashcards to Anki, Quizlet, as CSV files. Mind maps can be exported as images or in Markdown format. Audio overviews can be downloaded as MP3 files."
  },
  {
    question: "How is my data used and protected?",
    answer: "Your privacy is our priority. Uploaded content is encrypted and used only to generate your study materials. We don't use your data to train our models without explicit permission. We're GDPR compliant and never sell your data to third parties."
  },
  {
    question: "Is there a limit on how much I can upload?",
    answer: "The free plan includes 20 notebooks per account with up to 20 sources per notebook. Pro plans offer 200 notebooks per account with up to 100 sources per notebook. Each plan also includes daily limits on AI-generated content. Check our pricing section for details."
  },
  {
    question: "What makes SolomindLM different from Quizlet or Anki?",
    answer: "Unlike Quizlet or Anki which require manual content creation, SolomindLM uses AI to automatically generate study materials from any content source. Simply upload a PDF, video, or article, and get flashcards, quizzes, and mind maps instantly—saving you hours of manual work."
  },
  {
    question: "How long does it take to generate study materials?",
    answer: "Most documents are processed in under 60 seconds. A 20-page PDF typically takes about 30 seconds to generate comprehensive flashcards, quizzes, and summaries."
  }
];

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      <section id="faq" className="py-32 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
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
                <span className="font-semibold text-foreground pr-4">
                  {faq.question}
                </span>
                {openIndex === index ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index
                    ? 'max-h-96 opacity-100 pb-5'
                    : 'max-h-0 opacity-0'
                }`}
              >
                <p className="px-6 text-muted-foreground leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Still Have Questions CTA */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Still have questions?
          </p>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => {
              // Open contact form or email
              window.location.href = 'mailto:support@solomindlm.com';
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
