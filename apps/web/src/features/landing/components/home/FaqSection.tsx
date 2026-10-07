import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import type { FAQItem } from "../../constants";
import { LANDING_FAQS } from "../../faqRegistry";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

/**
 * One question. Closed answers stay in the HTML (forceMount + the hidden attribute), as the FAQ
 * structured data lists every answer and find-in-page should reach them.
 */
function FaqRow({ faq, defaultOpen }: { faq: FAQItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card variant="flush">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="disclosure" size="chip" className="group/faq w-full justify-between">
            {faq.question}
            <Plus
              aria-hidden
              className="text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]/faq:rotate-45"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent forceMount hidden={!open}>
          <p className="px-4 pt-1 pb-5 font-serif text-base leading-relaxed text-foreground/75">
            {faq.answer}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

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
          <ul className="flex flex-col gap-2.5">
            {LANDING_FAQS.map((faq, index) => (
              <li key={faq.question}>
                <FaqRow faq={faq} defaultOpen={index === 0} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
