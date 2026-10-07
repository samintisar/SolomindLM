import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { Reveal } from "./Reveal";

interface BeatProps {
  number: number;
  label: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  /** Visual on the left at lg and up. */
  flip?: boolean;
}

export function Beat({ number, label, title, body, points, visual, flip = false }: BeatProps) {
  return (
    <div className="grid items-center gap-12 py-12 md:py-16 lg:grid-cols-2 lg:gap-18">
      <Reveal className={cn(flip && "lg:order-2")}>
        <p className="flex items-center gap-2.5 font-sans text-sm font-semibold text-primary">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-xs text-primary-foreground">
            {number}
          </span>
          {label}
        </p>
        <h3 className="mt-4 font-display text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          {title}
        </h3>
        <p className="mt-4 font-serif text-lg leading-relaxed text-foreground/70">{body}</p>
        <ul className="mt-6 grid gap-2.5">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2.5 font-sans text-sm font-medium">
              <Check aria-hidden className="size-4 text-success" />
              {point}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className={cn(flip && "lg:order-1")}>{visual}</Reveal>
    </div>
  );
}
