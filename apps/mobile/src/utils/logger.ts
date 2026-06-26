import * as Sentry from "@sentry/react-native";

export const log = {
  info: (...args: unknown[]) => {
    if (__DEV__) console.log("[SolomindLM]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn("[SolomindLM]", ...args);
    if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
      Sentry.captureMessage(args.map(String).join(" "), "warning");
    }
  },
  error: (...args: unknown[]) => {
    console.error("[SolomindLM]", ...args);
    if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return;
    const err = args.find((arg): arg is Error => arg instanceof Error);
    if (err) {
      Sentry.captureException(err);
      return;
    }
    Sentry.captureMessage(args.map(String).join(" "), "error");
  },
};
