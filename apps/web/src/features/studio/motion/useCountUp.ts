import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Eases a number toward `target` (ease-out cubic) for scores and tallies: from 0 on mount, then
 * from the value currently shown whenever the target changes. Lands exactly on the target (so
 * fractional scores like 2.5 stay exact). Returns the target at once under reduced motion, for a
 * non-positive duration, or where requestAnimationFrame is unavailable.
 */
export function useCountUp(target: number, duration = 900): number {
  const reduceMotion = useReducedMotion();
  const instant =
    reduceMotion === true || duration <= 0 || typeof requestAnimationFrame === "undefined";
  const [value, setValue] = useState(instant ? target : 0);
  const shown = useRef(value);

  useEffect(() => {
    if (instant) return;
    const from = shown.current;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min((now - start) / duration, 1);
      const next =
        progress >= 1 ? target : Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      shown.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, instant]);

  return instant ? target : value;
}
