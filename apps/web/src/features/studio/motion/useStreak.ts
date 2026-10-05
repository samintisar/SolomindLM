import { useCallback, useState } from "react";

/** Consecutive successes (a correct answer, full marks); any miss resets it. */
export function useStreak() {
  const [streak, setStreak] = useState(0);
  const record = useCallback((success: boolean) => {
    setStreak((current) => (success ? current + 1 : 0));
  }, []);
  const reset = useCallback(() => setStreak(0), []);
  /** Puts back an earlier count, e.g. when a recorded answer fails to save. */
  const restore = useCallback((value: number) => setStreak(value), []);
  return { streak, record, reset, restore };
}
