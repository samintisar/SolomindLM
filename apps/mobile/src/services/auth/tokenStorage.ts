import * as SecureStore from "expo-secure-store";

const KEY = "solomindlm.auth.bridge.v1";

/** Reserved for a future native Convex session bridge. */
export async function readStoredAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeStoredAuthToken(token: string | null): Promise<void> {
  if (!token) {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* no stored value */
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}
