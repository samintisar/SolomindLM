export const log = {
  info: (...args: unknown[]) => {
    if (__DEV__) console.log("[SolomindLM]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn("[SolomindLM]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[SolomindLM]", ...args);
  },
};
