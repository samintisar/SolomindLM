import type { TokenStorage } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Web: `expo-secure-store` uses native `ExpoSecureStore`; `getValueWithKeyAsync` is missing on web,
 * so Convex Auth must use `localStorage` (SSR-safe when `window` is undefined).
 */
function createWebTokenStorage(): TokenStorage {
  return {
    getItem: async (key) => {
      try {
        if (typeof globalThis.window === "undefined") return null;
        return globalThis.window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        if (typeof globalThis.window === "undefined") return;
        globalThis.window.localStorage.setItem(key, value);
      } catch {
        /* quota / private mode */
      }
    },
    removeItem: async (key) => {
      try {
        if (typeof globalThis.window === "undefined") return;
        globalThis.window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

const nativeTokenStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/**
 * Convex Auth token storage for React Native (required by @convex-dev/auth).
 * Keys are the namespaced strings produced by the auth client.
 */
export const convexAuthSecureStorage: TokenStorage =
  Platform.OS === "web" ? createWebTokenStorage() : nativeTokenStorage;
