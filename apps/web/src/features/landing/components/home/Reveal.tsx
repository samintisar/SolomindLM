import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";

interface RevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fades and lifts its content in the first time it scrolls into view. Without IntersectionObserver
 * (tests, very old browsers) it renders shown; under reduced motion it never moves or fades.
 * Never wrap the hero: content above the fold must not wait for an observer (LCP).
 */
export function Reveal({ children, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (shown || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={cn(
        "transition duration-700 ease-out motion-reduce:transition-none",
        shown
          ? "translate-y-0 opacity-100"
          : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}
