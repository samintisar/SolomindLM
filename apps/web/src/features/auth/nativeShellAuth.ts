import { clearShellAuthMirror, getShellConvexDeploymentUrl } from "@/features/auth/shellAuthMirror";
import { getNativeWebViewBridge, isNativeShell } from "@/utils/platformDetection";
import type { NativeAuthResponse } from "./nativeShellAuthTypes";

export type { NativeAuthResponse } from "./nativeShellAuthTypes";

const AUTH_TIMEOUT_MS = 120_000;
const TOKEN_SYNC_TIMEOUT_MS = 5_000;

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function parseMessageData(data: unknown): NativeAuthResponse | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as NativeAuthResponse;
    if (parsed?.type === "native-auth:response") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function isNativeAuthResponse(value: unknown): value is NativeAuthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as NativeAuthResponse).type === "native-auth:response" &&
    typeof (value as NativeAuthResponse).requestId === "string"
  );
}

function waitForNativeAuthResponse(requestId: string): Promise<NativeAuthResponse> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Native authentication timed out"));
    }, AUTH_TIMEOUT_MS);

    const handleResponse = (response: NativeAuthResponse) => {
      if (response.requestId !== requestId) return;
      cleanup();
      resolve(response);
    };

    const customHandler = (event: Event) => {
      const detail = (event as CustomEvent<NativeAuthResponse>).detail;
      if (isNativeAuthResponse(detail)) {
        handleResponse(detail);
      }
    };

    const messageHandler = (event: Event) => {
      const response = parseMessageData((event as MessageEvent).data);
      if (response) handleResponse(response);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("solomindlm-native-auth-response", customHandler);
      window.removeEventListener("message", messageHandler);
      document.removeEventListener("message", messageHandler);
    };

    window.addEventListener("solomindlm-native-auth-response", customHandler);
    window.addEventListener("message", messageHandler);
    document.addEventListener("message", messageHandler);
  });
}

type NativeAuthRequest =
  | { type: "native-auth:webview-ready"; requestId: string; convexDeploymentUrl: string }
  | { type: "native-auth:token-sync"; requestId: string }
  | { type: "native-auth:google-sign-in"; requestId: string }
  | {
      type: "native-auth:password-sign-in";
      requestId: string;
      params: Record<string, string>;
    }
  | { type: "native-auth:sign-out"; requestId: string };

type NativeAuthRequestWithoutId =
  | { type: "native-auth:webview-ready"; convexDeploymentUrl: string }
  | { type: "native-auth:token-sync" }
  | { type: "native-auth:google-sign-in" }
  | {
      type: "native-auth:password-sign-in";
      params: Record<string, string>;
    }
  | { type: "native-auth:sign-out" };

function postNativeAuthRequest(request: NativeAuthRequest): void {
  const bridge = getNativeWebViewBridge();
  if (!bridge) {
    throw new Error("Native WebView bridge is not available");
  }
  bridge.postMessage(JSON.stringify(request));
}

async function requestNativeAuth(request: NativeAuthRequestWithoutId): Promise<NativeAuthResponse> {
  if (!isNativeShell()) {
    throw new Error("Native auth is only available in the mobile shell");
  }

  const requestId = createRequestId();
  const responsePromise = waitForNativeAuthResponse(requestId);
  postNativeAuthRequest({ ...request, requestId } as NativeAuthRequest);
  const response = await responsePromise;

  if (!response.success) {
    throw new Error(response.error ?? "Authentication failed");
  }

  return response;
}

export async function notifyNativeWebViewReady(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    await requestNativeAuth({
      type: "native-auth:webview-ready",
      convexDeploymentUrl: getShellConvexDeploymentUrl(),
    });
  } catch {
    /* non-fatal on initial load */
  }
}

/** Ask native to re-inject the latest JWT from secure storage (after refresh). */
export async function requestNativeTokenSync(): Promise<void> {
  if (!isNativeShell()) return;

  const syncPromise = waitForNativeAuthSync();
  try {
    await requestNativeAuth({ type: "native-auth:token-sync" });
  } catch {
    /* inject may still arrive */
  }
  await syncPromise;
}

function waitForNativeAuthSync(timeoutMs = TOKEN_SYNC_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const handler = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("solomindlm-native-auth-sync", handler);
    };

    window.addEventListener("solomindlm-native-auth-sync", handler);
  });
}

export async function requestNativeGoogleSignIn(): Promise<boolean> {
  const response = await requestNativeAuth({ type: "native-auth:google-sign-in" });
  return response.authenticated ?? false;
}

export async function requestNativePasswordSignIn(
  params: Record<string, string>
): Promise<boolean> {
  const response = await requestNativeAuth({
    type: "native-auth:password-sign-in",
    params,
  });
  return response.authenticated ?? false;
}

export async function requestNativeSignOut(): Promise<void> {
  await requestNativeAuth({ type: "native-auth:sign-out" });
  clearShellAuthStorageAndNotify();
}

/** Clears mirrored JWT in the WebView and notifies the shell auth hook (sign-out). */
export function clearShellAuthStorageAndNotify(): void {
  clearShellAuthMirror();
}
