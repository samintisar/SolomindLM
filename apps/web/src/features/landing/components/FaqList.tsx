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
import type { FAQItem } from "../constants";

/** A question plus an optional link to the page that covers it in depth (the RegisteredFaq shape). */
export type FaqListItem = FAQItem & { learnMorePath?: string; learnMoreLabel?: string };

/**
 * One question. Closed answers stay in the HTML (forceMount + the hidden attribute), as the FAQ
 * structured data lists every answer and find-in-page should reach them.
 */
function FaqRow({ faq, defaultOpen }: { faq: FaqListItem; defaultOpen: boolean }) {
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
          {faq.learnMorePath && faq.learnMoreLabel ? (
            <div className="px-4 pb-5">
              <Link
                to={faq.learnMorePath}
                className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-primary hover:underline"
              >
                {faq.learnMoreLabel}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/** The home page's FAQ rows, shared with the content pages. */
export function FaqList({
  faqs,
  defaultOpenIndex,
}: {
  faqs: FaqListItem[];
  defaultOpenIndex?: number;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {faqs.map((faq, index) => (
        <li key={faq.question}>
          <FaqRow faq={faq} defaultOpen={index === defaultOpenIndex} />
        </li>
      ))}
    </ul>
  );
}
