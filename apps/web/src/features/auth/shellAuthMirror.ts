import { convexAuthStorageKeys } from "@/utils/convexAuthStorageKeys";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

export type ShellAuthTokenPayload = {
  type: "native-auth:tokens";
  deploymentUrl: string;
  jwt: string | null;
  refresh: string | null;
};

export type ShellAuthInjectAck = {
  type: "native-auth:inject-ack";
  deploymentUrl: string;
  jwtKey: string;
  hasStoredJwt: boolean;
  hasMemoryJwt: boolean;
};

export type ShellWebErrorPayload = {
  type: "shell-web:error";
  message: string;
  source?: string;
};

export function getShellConvexDeploymentUrl(): string {
  return CONVEX_URL;
}

export function getShellAuthStorageKeys(deploymentUrl = CONVEX_URL) {
  return convexAuthStorageKeys(deploymentUrl);
}

/** Read mirrored JWT for the web app's Convex deployment. */
export function readShellJwt(deploymentUrl = CONVEX_URL): string | null {
  const keys = convexAuthStorageKeys(deploymentUrl);
  try {
    const shell = window.__SOLOMIND_SHELL_AUTH__;
    if (
      shell &&
      shell.deploymentUrl === deploymentUrl &&
      typeof shell.jwt === "string" &&
      shell.jwt.length > 0
    ) {
      return shell.jwt;
    }
    const fromStorage = localStorage.getItem(keys.jwt);
    return fromStorage && fromStorage.length > 0 ? fromStorage : null;
  } catch {
    return null;
  }
}

/** Apply tokens from native inject or postMessage into WebView storage. */
export function applyShellAuthTokens(
  deploymentUrl: string,
  jwt: string | null,
  refresh: string | null,
): void {
  const keys = convexAuthStorageKeys(deploymentUrl);
  try {
    if (jwt) {
      localStorage.setItem(keys.jwt, jwt);
    } else {
      localStorage.removeItem(keys.jwt);
    }
    if (refresh) {
      localStorage.setItem(keys.refresh, refresh);
    } else {
      localStorage.removeItem(keys.refresh);
    }
    window.__SOLOMIND_SHELL_AUTH__ = { jwt, deploymentUrl };
    window.dispatchEvent(new CustomEvent("solomindlm-native-auth-sync"));
  } catch {
    /* localStorage unavailable */
  }
}

export function clearShellAuthMirror(deploymentUrl = CONVEX_URL): void {
  applyShellAuthTokens(deploymentUrl, null, null);
}

export function parseShellAuthTokenPayload(data: unknown): ShellAuthTokenPayload | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as ShellAuthTokenPayload;
    if (parsed?.type === "native-auth:tokens" && typeof parsed.deploymentUrl === "string") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function reportShellWebError(message: string, source?: string): void {
  const bridge = window.ReactNativeWebView;
  if (!bridge) return;
  try {
    const payload: ShellWebErrorPayload = { type: "shell-web:error", message, source };
    bridge.postMessage(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
