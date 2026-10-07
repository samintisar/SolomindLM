import { cva } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowRight, FileText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { getIntentScene } from "../../intentScenes";
import { DemoSurface } from "../home/demo/DemoSurface";
import { toneIcon } from "../home/tone";
import { OutputCard } from "./OutputCard";
import { Stage } from "./Stage";

interface SourceToOutputProps {
  intentKey: string;
  caption: { source: string; output: string };
}

/** Alternate source cards lean opposite ways, like a loose stack of files. */
const sourceTilt = cva("flex items-center gap-3 px-3.5 py-3", {
  variants: {
    tilt: {
      left: "-rotate-1",
      right: "rotate-1 md:ml-6",
    },
  },
});

/** One side of the stage: a readable label, the decorative picture, then the readable caption. */
function StageSide({
  label,
  icon: Icon,
  caption,
  children,
}: {
  label: string;
  icon: LucideIcon;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 md:col-span-5">
      <p className="flex items-center gap-1.5 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </p>
      <div aria-hidden inert className="relative flex flex-col gap-3">
        {children}
      </div>
      <p className="font-serif text-sm text-foreground/70">{caption}</p>
    </div>
  );
}

/** Tool-page stage: the files you bring → what the tool makes from them, with the page's captions. */
export function SourceToOutput({ intentKey, caption }: SourceToOutputProps) {
  const scene = getIntentScene(intentKey);
  if (!scene) return null;
  const { sources, output } = scene;

  return (
    <Stage>
      <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
        <StageSide label="Your source" icon={FileText} caption={caption.source}>
          {sources.map((source, index) => (
            <DemoSurface
              key={source.name}
              className={sourceTilt({ tilt: index % 2 === 0 ? "left" : "right" })}
            >
              <span className={toneIcon({ tone: source.tone, className: "size-9 rounded-lg" })}>
                <source.icon className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-sans text-sm leading-snug font-semibold">
                  {source.name}
                </span>
                <span className="block font-sans text-xs text-muted-foreground">{source.meta}</span>
              </span>
            </DemoSurface>
          ))}
        </StageSide>

        <div className="flex justify-center md:col-span-2">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-full bg-card text-primary shadow-md ring-1 ring-hairline"
          >
            <ArrowDown className="size-5 md:hidden" />
            <ArrowRight className="size-5 max-md:hidden" />
          </span>
        </div>

        <StageSide label="What you get" icon={Sparkles} caption={caption.output}>
          {output.kind === "demo" ? (
            output.render("w-full")
          ) : (
            <OutputCard
              intentKey={intentKey}
              title={output.title}
              meta={output.meta}
              rows={output.rows}
              shape={output.shape}
              className="w-full"
            />
          )}
        </StageSide>
      </div>
    </Stage>
  );
}
