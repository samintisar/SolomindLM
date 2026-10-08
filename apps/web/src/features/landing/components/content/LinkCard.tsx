import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/shared/components/ui/card";
import { type Tone, toneIcon } from "../home/tone";

interface LinkCardProps {
  to: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** The title's heading level: h3 by default, h4 when the cards sit under an h3 group heading. */
  headingLevel?: "h3" | "h4";
}

/** A card that is one link: hub tools, related pages and guides. The inner link carries the focus ring. */
export function LinkCard({
  to,
  title,
  description,
  icon: Icon,
  tone,
  headingLevel: Heading = "h3",
}: LinkCardProps) {
  return (
    <Card variant="interactive" className="h-full">
      <Link
        to={to}
        className="flex h-full flex-col gap-3 p-5 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {Icon ? (
          <span aria-hidden className={toneIcon({ tone, className: "size-9 rounded-xl" })}>
            <Icon className="size-4.5" />
          </span>
        ) : null}
        <Heading className="font-sans text-base font-semibold">{title}</Heading>
        <p className="flex-1 font-sans text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <span className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-primary">
          Learn more
          <ArrowRight aria-hidden className="size-4" />
        </span>
      </Link>
    </Card>
  );
}
