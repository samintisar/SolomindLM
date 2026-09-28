import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, ENTER_OFFSET } from "./tokens";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before animating. */
  delay?: number;
  /** Animate when scrolled into view instead of on mount. */
  inView?: boolean;
}

export function Reveal({ children, className, delay = 0, inView = false }: RevealProps) {
  const hidden = { opacity: 0, y: ENTER_OFFSET };
  const shown = { opacity: 1, y: 0 };
  const transition = { duration: DURATION.slow, ease: EASE_OUT, delay };

  return inView ? (
    <m.div
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={transition}
    >
      {children}
    </m.div>
  ) : (
    <m.div className={className} initial={hidden} animate={shown} transition={transition}>
      {children}
    </m.div>
  );
}
