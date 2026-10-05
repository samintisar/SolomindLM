import { useCallback, useState } from "react";

/** Consecutive successes (a correct answer, full marks); any miss resets it. */
export function useStreak() {
  const [streak, setStreak] = useState(0);
  const record = useCallback((success: boolean) => {
    setStreak((current) => (success ? current + 1 : 0));
  }, []);
  const reset = useCallback(() => setStreak(0), []);
  return { streak, record, reset };
}
