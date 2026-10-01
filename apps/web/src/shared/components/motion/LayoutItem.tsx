import { type HTMLMotionProps, m } from "motion/react";
import { DURATION } from "./tokens";

/**
 * Grid/list item that glides when siblings reorder and fades out when removed (inside
 * <AnimatePresence>). No `initial`: entrance is CSS, so items never wait on the lazy chunk.
 */
export function LayoutItem(props: HTMLMotionProps<"div">) {
  return (
    <m.div
      layout="position"
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: DURATION.slow }}
      {...props}
    />
  );
}
