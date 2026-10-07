import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { Reveal } from "./Reveal";

/** The italic, brand-coloured phrase every landing heading ends on. */
export function Accent({ children }: { children: ReactNode }) {
  return <em className="font-normal text-primary">{children}</em>;
}

interface SectionHeadingProps {
  /** id for the h2, so the section can be `aria-labelledby` it. */
  id: string;
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "start";
}

export function SectionHeading({ id, eyebrow, title, sub, align = "center" }: SectionHeadingProps) {
  return (
    <Reveal className={cn("flex flex-col gap-4", align === "center" && "items-center text-center")}>
      <p className="font-sans text-xs font-semibold tracking-widest text-primary uppercase">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="max-w-3xl font-display text-4xl leading-tight font-bold tracking-tight text-balance md:text-display"
      >
        {title}
      </h2>
      {sub ? (
        <p className="max-w-2xl font-serif text-lg leading-relaxed text-foreground/70">{sub}</p>
      ) : null}
    </Reveal>
  );
}
