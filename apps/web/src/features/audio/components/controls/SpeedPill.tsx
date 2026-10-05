import { cva } from "class-variance-authority";

const pillVariants = cva(
  "inline-flex h-7 min-w-12 shrink-0 items-center justify-center rounded-full bg-muted px-2 font-sans text-xs font-semibold tabular-nums text-foreground transition-colors duration-150 ease-out outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary/90"
);

interface SpeedPillProps {
  rate: number;
  onCycle: () => void;
  disabled?: boolean;
}

/** Playback speed. Highlighted off 1×; the number rolls up each time it changes. */
export function SpeedPill({ rate, onCycle, disabled }: SpeedPillProps) {
  const label = `${rate}×`;

  return (
    <button
      type="button"
      data-active={rate !== 1}
      aria-label={`Playback speed ${label}`}
      disabled={disabled}
      onClick={onCycle}
      className={pillVariants()}
    >
      <span className="relative h-4 overflow-hidden">
        <span
          key={rate}
          className="block animate-in fade-in slide-in-from-bottom-full duration-300 ease-out"
        >
          {label}
        </span>
      </span>
    </button>
  );
}
