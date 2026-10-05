import { cva } from "class-variance-authority";

const skipVariants = cva(
  "group inline-flex shrink-0 items-center justify-center rounded-full bg-transparent text-foreground transition-colors duration-150 ease-out outline-hidden hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      size: {
        default: "size-10",
        sm: "size-8",
      },
    },
    defaultVariants: { size: "default" },
  }
);

const iconVariants = cva("transition-transform duration-150 ease-out", {
  variants: {
    size: {
      default: "size-7",
      sm: "size-5.5",
    },
    direction: {
      back: "group-active:-rotate-12 group-active:scale-90 motion-reduce:group-active:rotate-0 motion-reduce:group-active:scale-100",
      forward:
        "group-active:rotate-12 group-active:scale-90 motion-reduce:group-active:rotate-0 motion-reduce:group-active:scale-100",
    },
  },
  defaultVariants: { size: "default" },
});

interface SkipButtonProps {
  direction: "back" | "forward";
  onSkip: () => void;
  disabled?: boolean;
  size?: "default" | "sm";
}

/** Podcast-style 10 second skip: a circular arrow with "10" inside that twists when pressed. */
export function SkipButton({ direction, onSkip, disabled, size = "default" }: SkipButtonProps) {
  const label = direction === "back" ? "Back 10 seconds" : "Forward 10 seconds";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onSkip}
      className={skipVariants({ size })}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        className={iconVariants({ size, direction })}
      >
        {/* Only the arrow is mirrored for forward, so the number still reads left to right. */}
        <g
          transform={direction === "forward" ? "matrix(-1 0 0 1 24 0)" : undefined}
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
          <path d="M4 3.8v3.4h3.4" />
        </g>
        <text
          x="12"
          y="15"
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="700"
          fill="currentColor"
          className="font-sans tabular-nums"
        >
          10
        </text>
      </svg>
    </button>
  );
}
