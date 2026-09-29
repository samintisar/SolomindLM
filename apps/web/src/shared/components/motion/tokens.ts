/** Mirrors the CSS motion tokens in src/index.css. Seconds, as motion/react expects. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  slower: 0.5,
} as const;

/** Default distance (px) for enter slides. Small on purpose: premium motion is felt, not seen. */
export const ENTER_OFFSET = 8;
