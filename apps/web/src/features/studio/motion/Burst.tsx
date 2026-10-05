import { useReducedMotion } from "motion/react";
import type React from "react";
import { cn } from "@/shared/utils/cn";

const COLORS = ["bg-success", "bg-primary", "bg-warning", "bg-info"] as const;
const COUNT = 14;

// Fixed directions spread round the circle (with a little jitter), so renders are stable.
const PARTICLES = Array.from({ length: COUNT }, (_, n) => {
  const angle = (n / COUNT) * Math.PI * 2 + (n % 3) * 0.35;
  const distance = 44 + (n % 4) * 14;
  return {
    id: n,
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance - 12),
    rotate: (n * 47) % 360,
    color: COLORS[n % COLORS.length],
  };
});

/**
 * A one-shot particle burst from the centre of its positioned parent, for a correct answer or a
 * perfect score. Remount it (change its `key`) to play it again. Renders nothing under reduced motion.
 */
export function Burst({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <span
      aria-hidden="true"
      data-slot="burst"
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        className
      )}
    >
      {PARTICLES.map((particle) => (
        <span
          key={particle.id}
          className={cn("absolute size-1.5 rounded-xs animate-studio-burst", particle.color)}
          style={
            {
              "--burst-dx": `${particle.dx}px`,
              "--burst-dy": `${particle.dy}px`,
              "--burst-rotate": `${particle.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
