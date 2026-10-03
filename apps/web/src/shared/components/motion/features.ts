import { domMax } from "motion/react";

// Loaded via dynamic import from MotionProvider so animation features stay out of the entry chunk.
// domMax (not domAnimation) because the notebooks grid uses layout animations.
export default domMax;
