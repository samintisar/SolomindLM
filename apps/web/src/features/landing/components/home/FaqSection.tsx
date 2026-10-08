import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { LANDING_FAQS } from "../../faqRegistry";
import { FaqList } from "../FaqList";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

/** Renders every LANDING_FAQS entry: the FAQ structured data uses the same list. */
export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-280 grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-4">
          <SectionHeading
            id="faq-title"
            align="start"
            eyebrow="FAQ"
            title={
              <>
                Questions, <Accent>answered.</Accent>
              </>
            }
          />
          <Reveal>
            <p className="mt-4 font-serif text-base leading-relaxed text-foreground/70">
              Can't find yours? Email{" "}
              <a
                href="mailto:support@solomindlm.com"
                className="font-medium text-primary hover:underline"
              >
                support@solomindlm.com
              </a>
              , a person reads every message.
            </p>
            <Link
              to="/faq"
              className="mt-5 inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-primary hover:underline"
            >
              See all questions
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-8">
          <FaqList faqs={LANDING_FAQS} defaultOpenIndex={0} />
        </Reveal>
      </div>
    </section>
  );
}
