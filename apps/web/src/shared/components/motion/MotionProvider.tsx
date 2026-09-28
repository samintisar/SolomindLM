import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT } from "./tokens";

const loadFeatures = () => import("./features").then((mod) => mod.default);

/**
 * App-wide motion defaults. `strict` makes `motion.*` components throw, so everything uses the
 * lightweight `m.*` components and the feature bundle loads lazily.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE_OUT }}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
