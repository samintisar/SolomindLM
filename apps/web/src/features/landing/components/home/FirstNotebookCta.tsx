import { ArrowRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { NewNotebookDemo } from "./demo/NewNotebookDemo";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

export function FirstNotebookCta({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section aria-labelledby="cta-title" className="px-6 pt-8 pb-28 md:pb-32">
      <div className="mx-auto grid max-w-280 items-center gap-14 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-7">
          <SectionHeading
            id="cta-title"
            align="start"
            eyebrow="Your turn"
            title={
              <>
                Your next notebook is <Accent>one upload away.</Accent>
              </>
            }
          />
          <Reveal>
            <p className="mt-5 max-w-lg font-serif text-lg leading-relaxed text-foreground/70">
              Start with the lecture you're dreading. Ask it anything, then let it question you
              back. Free, no card, and you can stop whenever.
            </p>
            <Button size="lg" className="mt-8" onClick={onGetStarted}>
              Create my first notebook
              <ArrowRight aria-hidden />
            </Button>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-5">
          <NewNotebookDemo />
        </Reveal>
      </div>
    </section>
  );
}
