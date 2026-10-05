import { cva } from "class-variance-authority";
import { Pause, Play } from "lucide-react";
import { cn } from "@/shared/utils/cn";

const playVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition duration-150 ease-out outline-hidden hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
  {
    variants: {
      size: {
        default: "size-12",
        sm: "size-9",
      },
    },
    defaultVariants: { size: "default" },
  }
);

interface PlayButtonProps {
  isPlaying: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "default" | "sm";
  /** Announced as `aria-keyshortcuts`, for a player that listens for these keys. */
  keyShortcuts?: string;
}

/** The round primary play/pause button. */
export function PlayButton({
  isPlaying,
  onToggle,
  disabled,
  size = "default",
  keyShortcuts,
}: PlayButtonProps) {
  const iconSize = size === "sm" ? "size-4" : "size-5";

  return (
    <button
      type="button"
      aria-label={isPlaying ? "Pause" : "Play"}
      aria-keyshortcuts={keyShortcuts}
      disabled={disabled}
      onClick={onToggle}
      className={playVariants({ size })}
    >
      {isPlaying ? (
        <Pause aria-hidden className={iconSize} />
      ) : (
        <Play aria-hidden className={cn(iconSize, "ml-0.5")} />
      )}
    </button>
  );
}
