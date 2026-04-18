/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_CONVEX_URL?: string;
    EXPO_PUBLIC_WEB_URL?: string;
    EXPO_PUBLIC_SENTRY_DSN?: string;
    EXPO_PUBLIC_EAS_PROJECT_ID?: string;
  }
}
