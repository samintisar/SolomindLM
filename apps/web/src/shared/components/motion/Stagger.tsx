import type { Variants } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, ENTER_OFFSET } from "./tokens";

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: ENTER_OFFSET },
  shown: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

interface StaggerProps {
  children: ReactNode;
  className?: string;
}

export function Stagger({ children, className }: StaggerProps) {
  return (
    <m.div className={className} variants={container} initial="hidden" animate="shown">
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: StaggerProps) {
  return (
    <m.div className={className} variants={item}>
      {children}
    </m.div>
  );
}
