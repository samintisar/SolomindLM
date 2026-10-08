import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { Stage } from "../content/Stage";
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

/** One "How it works" row: copy beside a product picture that sits on its own soft stage. */
export function Beat({ number, label, title, body, points, visual, flip = false }: BeatProps) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 py-14 md:py-20 lg:grid-cols-12 lg:gap-16">
      <Reveal className={cn("lg:col-span-5", flip && "lg:order-2")}>
        <p className="flex items-center gap-2.5 font-sans text-sm font-semibold text-primary">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-xs text-primary-foreground">
            {number}
          </span>
          {label}
        </p>
        <h3 className="mt-5 font-display text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          {title}
        </h3>
        <p className="mt-5 max-w-md font-serif text-lg leading-relaxed text-foreground/70">
          {body}
        </p>
        <ul className="mt-7 grid gap-3">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2.5 font-sans text-sm font-medium">
              <Check aria-hidden className="size-4 text-success" />
              {point}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className={cn("lg:col-span-7", flip && "lg:order-1")}>
        <Stage>{visual}</Stage>
      </Reveal>
    </div>
  );
}
