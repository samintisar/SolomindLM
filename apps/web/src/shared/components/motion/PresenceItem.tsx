import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, ENTER_OFFSET } from "./tokens";

export { AnimatePresence } from "motion/react";

interface PresenceItemProps {
  children: ReactNode;
  className?: string;
}

/** List item with enter and exit motion. Render inside <AnimatePresence initial={false}> with a stable key. */
export function PresenceItem({ children, className }: PresenceItemProps) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: ENTER_OFFSET }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -ENTER_OFFSET / 2, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}
