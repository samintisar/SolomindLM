import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Eases a number from 0 up to `target` (ease-out cubic) for scores and tallies. Jumps straight to
 * the target under reduced motion, or where requestAnimationFrame is unavailable.
 */
export function useCountUp(target: number, duration = 900): number {
  const reduceMotion = useReducedMotion();
  const instant = reduceMotion === true || typeof requestAnimationFrame === "undefined";
  const [value, setValue] = useState(instant ? target : 0);

  useEffect(() => {
    if (instant) {
      setValue(target);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, instant]);

  return value;
}
