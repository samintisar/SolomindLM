import { cva } from "class-variance-authority";
import { cn } from "@/shared/utils/cn";
import { getIntentTool } from "../../intentTools";
import { DemoLabel, DemoSurface } from "../home/demo/DemoSurface";
import { toneIcon } from "../home/tone";

export type OutputCardShape = "list" | "waveform" | "columns";

interface OutputCardProps {
  /** Picks the header icon and tone (same as the tool's cards). */
  intentKey: string;
  title: string;
  meta: string;
  rows: string[];
  shape?: OutputCardShape;
  className?: string;
}

/** Fixed so renders stay stable: 28 bars, the first 18 "played". */
const WAVE_HEIGHTS = [
  3, 5, 7, 4, 6, 8, 5, 3, 6, 7, 4, 8, 6, 5, 7, 3, 5, 6, 8, 4, 6, 3, 5, 7, 4, 6, 3, 5,
] as const;
const PLAYED_BARS = 18;

const waveBar = cva("w-1 shrink-0 rounded-full", {
  variants: {
    height: {
      2: "h-2",
      3: "h-3",
      4: "h-4",
      5: "h-5",
      6: "h-6",
      7: "h-7",
      8: "h-8",
    },
    played: {
      true: "bg-primary/70",
      false: "bg-primary/25",
    },
  },
});

function ListRows({ rows }: { rows: string[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row} className="rounded-lg bg-muted/60 px-3 py-2 font-serif text-sm leading-snug">
          {row}
        </li>
      ))}
    </ul>
  );
}

function Waveform({ rows }: { rows: string[] }) {
  return (
    <>
      <div className="flex h-10 items-center justify-between gap-0.5 rounded-lg bg-muted/60 px-3">
        {WAVE_HEIGHTS.map((height, index) => (
          <span key={index} className={waveBar({ height, played: index < PLAYED_BARS })} />
        ))}
      </div>
      {rows.map((row) => (
        <p key={row} className="mt-3 font-serif text-sm leading-snug text-foreground/80">
          {row}
        </p>
      ))}
    </>
  );
}

function ColumnRows({ rows }: { rows: string[] }) {
  const [header, ...body] = rows.map((row) => row.split(" · "));
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-hairline">
      {header ? (
        <div className="grid grid-cols-3 gap-2 bg-muted px-3 py-2">
          {header.map((cell) => (
            <DemoLabel key={cell}>{cell}</DemoLabel>
          ))}
        </div>
      ) : null}
      {body.map((cells) => (
        <div
          key={cells.join()}
          className="grid grid-cols-3 gap-2 border-t border-border/50 px-3 py-2 font-sans text-xs"
        >
          {cells.map((cell, index) => (
            <span key={index} className="min-w-0 truncate">
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Decorative result card for tools without a home demo. The caller hides it (`aria-hidden`, `inert`). */
export function OutputCard({
  intentKey,
  title,
  meta,
  rows,
  shape = "list",
  className,
}: OutputCardProps) {
  const tool = getIntentTool(intentKey);
  const Icon = tool?.icon;
  return (
    <DemoSurface elevation="floating" className={cn("p-4", className)}>
      <div className="mb-3.5 flex items-center gap-3">
        {Icon && tool ? (
          <span className={toneIcon({ tone: tool.tone, className: "size-8 rounded-lg" })}>
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="font-display text-sm leading-snug font-bold">{title}</p>
          <DemoLabel>{meta}</DemoLabel>
        </div>
      </div>
      {shape === "waveform" ? <Waveform rows={rows} /> : null}
      {shape === "columns" ? <ColumnRows rows={rows} /> : null}
      {shape === "list" ? <ListRows rows={rows} /> : null}
    </DemoSurface>
  );
}
