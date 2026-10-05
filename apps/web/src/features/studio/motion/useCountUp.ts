import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Eases a number toward `target` (ease-out cubic) for scores and tallies: from 0 on mount, then
 * from the value currently shown whenever the target changes. Lands exactly on the target (so
 * fractional scores like 2.5 stay exact). Returns the target at once under reduced motion, for a
 * non-positive duration, or where requestAnimationFrame is unavailable. `delay` holds the value
 * still for that many ms (measured from the first frame) before the count starts.
 */
export function useCountUp(target: number, duration = 900, delay = 0): number {
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
      const elapsed = now - start - delay;
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const next =
        progress >= 1 ? target : Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      shown.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, delay, instant]);

  return instant ? target : value;
}
