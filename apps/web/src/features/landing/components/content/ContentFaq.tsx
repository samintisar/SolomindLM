import type { ReactNode } from "react";
import { FaqList, type FaqListItem } from "../FaqList";
import { Reveal } from "../home/Reveal";
import { Accent, SectionHeading } from "../home/SectionHeading";

interface ContentFaqProps {
  faqs: FaqListItem[];
  title?: ReactNode;
  /** id for the heading, so the section can be `aria-labelledby` it. */
  id: string;
}

const DEFAULT_TITLE = (
  <>
    Questions, <Accent>answered.</Accent>
  </>
);

/** The home FAQ's two-column layout: heading on the left, questions on the right. */
export function ContentFaq({ faqs, title = DEFAULT_TITLE, id }: ContentFaqProps) {
  return (
    <section aria-labelledby={id} className="px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-280 grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-4">
          <SectionHeading id={id} align="start" eyebrow="FAQ" title={title} />
        </div>
        <Reveal className="lg:col-span-8">
          <FaqList faqs={faqs} defaultOpenIndex={0} />
        </Reveal>
      </div>
    </section>
  );
}
