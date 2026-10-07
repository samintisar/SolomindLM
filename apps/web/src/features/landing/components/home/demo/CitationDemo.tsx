import { ArrowUpRight, FileText } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { toneIcon } from "../tone";
import { DemoSurface } from "./DemoSurface";

export function CitationChip({
  n,
  active = false,
  className,
}: {
  n: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 align-middle font-sans text-xs leading-none font-bold",
        active
          ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
          : "bg-muted text-primary",
        className
      )}
    >
      {n}
    </span>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-sm bg-warning/45 px-0.5 text-foreground">{children}</mark>;
}

/** Hover card for citation [1] in the hero chat: file, slide, quoted passage. */
export function CitationTooltip({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("w-60 p-3 font-sans", className)}>
      <span className="absolute -top-1.5 left-2.5 size-3 rotate-45 border-t border-l border-border/50 bg-card" />
      <div className="flex items-center gap-2 text-xs">
        <span className={toneIcon({ tone: "pdf", className: "size-5 rounded-md" })}>
          <FileText className="size-3" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">Lecture 12 – Beta blockers.pdf</span>
          <span className="block text-muted-foreground">Slide 14</span>
        </span>
        <CitationChip n={1} active className="ml-auto" />
      </div>
      <blockquote className="mt-2 font-serif text-xs leading-relaxed text-foreground/80">
        “Non-selective agents antagonise β<sub>2</sub> receptors in bronchial smooth muscle and{" "}
        <Highlight>may precipitate bronchospasm in patients with asthma</Highlight>.”
      </blockquote>
      <p className="mt-2 flex items-center gap-1 border-t border-border/50 pt-2 text-xs font-semibold text-primary">
        Open in source <ArrowUpRight className="size-3" />
      </p>
    </DemoSurface>
  );
}

/** "Read with it" beat: a short cited answer with citation 2 active. */
export function AnswerDemo({ className }: { className?: string }) {
  return (
    <DemoSurface className={cn("p-5", className)}>
      <p className="ml-10 rounded-2xl rounded-br-sm bg-muted px-3.5 py-2.5 font-serif text-sm">
        Why are beta blockers avoided in asthma?
      </p>
      <p className="mt-3.5 font-serif text-sm leading-relaxed">
        Non-selective beta blockers also block β<sub>2</sub> receptors in the airways. Blocking them
        can trigger bronchospasm <CitationChip n={1} />. Cardioselective drugs like bisoprolol carry
        less risk <CitationChip n={2} active />.
      </p>
    </DemoSurface>
  );
}

/** "Read with it" beat: the slide citation 2 points at, the cited line highlighted and pinned. */
export function SourceSlideDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-3 font-sans text-xs font-semibold">
        <span className={toneIcon({ tone: "pdf", className: "size-5.5 rounded-md" })}>
          <FileText className="size-3" />
        </span>
        Lecture 12 – Beta blockers.pdf
        <span className="ml-auto font-medium text-muted-foreground">Slide 15</span>
      </div>
      <div className="m-3.5 rounded-xl bg-background p-4 ring-1 ring-hairline ring-inset">
        <h4 className="font-display text-sm font-bold">β-blockers: choosing an agent</h4>
        <ul className="mt-2.5 list-disc space-y-1.5 pl-4 font-serif text-xs leading-relaxed text-foreground/80">
          <li>Non-selective: propranolol, nadolol, timolol</li>
          <li>
            <CitationChip n={2} active className="mr-1" />
            <Highlight>
              Cardioselective agents such as bisoprolol act mainly on β<sub>1</sub>, so they carry
              less risk in asthma
            </Highlight>
          </li>
          <li>Start low and review if wheeze worsens</li>
        </ul>
      </div>
      <p className="flex items-center gap-1 px-3.5 pb-3.5 font-sans text-xs font-semibold text-primary">
        Open in source <ArrowUpRight className="size-3" />
      </p>
    </DemoSurface>
  );
}
