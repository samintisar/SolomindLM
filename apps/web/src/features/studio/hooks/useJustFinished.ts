import { useEffect, useRef, useState } from "react";

/** True for `ms` after `status` goes from "generating" to "completed": the Saved row's finish moment. */
export function useJustFinished(status: string | undefined, ms = 1400): boolean {
  const previous = useRef(status);
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was !== "generating" || status !== "completed") return;
    setJustFinished(true);
    const timer = setTimeout(() => setJustFinished(false), ms);
    return () => clearTimeout(timer);
  }, [status, ms]);

  return justFinished;
}
