import { Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { NotebookPreview } from "./NotebookPreview";
import { Accent } from "./SectionHeading";
import { scrollToSection } from "./scrollToSection";

const FINE_PRINT = ["Free plan, no card", "Works with any course"] as const;

export function HeroSection({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 lg:pt-36 lg:pb-28">
      <div aria-hidden className="landing-paper pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-300 grid-cols-1 items-start gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5 lg:pt-8">
          <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl xl:text-hero">
            AI that makes you think,{" "}
            <span className="lg:block">
              <Accent>not thinks for you.</Accent>
            </span>
          </h1>
          <p className="mt-6 max-w-md font-serif text-lg leading-relaxed text-foreground/75">
            SolomindLM won't write your essay. It reads your sources with you, answers with
            citations, and quizzes you until it sticks — so what you know at the exam is actually
            yours.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={onGetStarted}>
              Start free
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("features")}>
              How it works
            </Button>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-sans text-xs text-muted-foreground">
            {FINE_PRINT.map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <Check aria-hidden className="size-3.5 text-success" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-7">
          <NotebookPreview />
        </div>
      </div>
    </section>
  );
}
