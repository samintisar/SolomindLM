import {
  buildWebViewAuthInjectScript,
  buildWebViewAuthPostMessageScript,
} from "@mobile/components/web/buildWebViewAuthInjectScript";
import {
  buildNativeAuthResponseInjectScript,
  type NativeAuthResponsePayload,
} from "@mobile/components/web/buildNativeAuthResponseInjectScript";
import { completeNativeOAuthSignIn } from "@mobile/services/auth/nativeOAuthSignIn";
import { convexAuthSecureStorage } from "@mobile/services/auth/convexAuthSecureStorage";
import { convexAuthStorageKeys } from "@mobile/services/auth/convexAuthStorageKeys";
import { convexClient, convexDeploymentUrl } from "@mobile/services/convex/client";
import { log } from "@mobile/utils/logger";
import { ConvexAuthProvider, useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import type WebView from "react-native-webview";
import { NativeConvexAuthBridgeContext } from "./useNativeConvexAuthBridge";

type NativeAuthMessage =
  | { type: "native-auth:webview-ready"; requestId?: string; convexDeploymentUrl?: string }
  | { type: "native-auth:token-sync"; requestId: string }
  | { type: "native-auth:google-sign-in"; requestId: string }
  | {
      type: "native-auth:password-sign-in";
      requestId: string;
      params: Record<string, string>;
    }
  | { type: "native-auth:sign-out"; requestId: string }
  | {
      type: "native-auth:inject-ack";
      deploymentUrl: string;
      jwtKey: string;
      hasStoredJwt: boolean;
      hasMemoryJwt: boolean;
    }
  | { type: "shell-web:error"; message: string; source?: string };

function formatNativeAuthError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "Authentication failed";
}

function NativeAuthWebViewBridgeInner({ children }: { children: ReactNode }) {
  const { signIn, signOut } = useAuthActions();
  const authToken = useAuthToken();
  const webViewRef = useRef<WebView | null>(null);
  const pendingDeliveriesRef = useRef<Array<() => void>>([]);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInjectedRef = useRef<{ jwt: string | null; refresh: string | null }>({
    jwt: null,
    refresh: null,
  });
  const webConvexDeploymentUrlRef = useRef<string | null>(null);
  const webViewDocumentReadyRef = useRef(false);
  const pendingAuthSyncRef = useRef(false);
  const keys = useMemo(() => convexAuthStorageKeys(convexDeploymentUrl), []);

  const flushPendingDeliveries = useCallback(() => {
    if (!webViewRef.current) return;
    const pending = pendingDeliveriesRef.current.splice(0);
    for (const deliver of pending) {
      deliver();
    }
  }, []);

  const respond = useCallback(
    (
      requestId: string,
      success: boolean,
      options?: { error?: string; authenticated?: boolean },
    ) => {
      const payload: NativeAuthResponsePayload = {
        type: "native-auth:response",
        requestId,
        success,
        error: options?.error,
        authenticated: options?.authenticated,
      };

      const deliver = () => {
        const ref = webViewRef.current;
        if (!ref) return false;
        ref.injectJavaScript(buildNativeAuthResponseInjectScript(payload));
        return true;
      };

      if (!deliver()) {
        pendingDeliveriesRef.current.push(deliver);
        if (__DEV__) {
          console.debug("[NativeAuth] Queued auth response until WebView mounts", { requestId });
        }
      }
    },
    [],
  );

  const syncAuthToWebView = useCallback(async (options?: { force?: boolean }) => {
    const ref = webViewRef.current;
    if (!ref) {
      pendingAuthSyncRef.current = true;
      if (__DEV__) {
        console.debug("[NativeAuth] Deferred token inject — WebView not mounted yet");
      }
      return;
    }

    if (!webViewDocumentReadyRef.current) {
      pendingAuthSyncRef.current = true;
      if (__DEV__) {
        console.debug("[NativeAuth] Deferred token inject — document not ready");
      }
      return;
    }

    const injectDeploymentUrl =
      webConvexDeploymentUrlRef.current ?? convexDeploymentUrl;

    if (
      webConvexDeploymentUrlRef.current &&
      webConvexDeploymentUrlRef.current !== convexDeploymentUrl
    ) {
      log.warn(
        "[NativeAuth] Web/native Convex URL mismatch",
        webConvexDeploymentUrlRef.current,
        convexDeploymentUrl,
      );
    }

    const [storedJwt, refresh] = await Promise.all([
      convexAuthSecureStorage.getItem(keys.jwt),
      convexAuthSecureStorage.getItem(keys.refresh),
    ]);
    const jwt = authToken ?? storedJwt ?? null;

    if (
      !options?.force &&
      lastInjectedRef.current.jwt === (jwt ?? null) &&
      lastInjectedRef.current.refresh === (refresh ?? null)
    ) {
      return;
    }
    pendingAuthSyncRef.current = false;
    lastInjectedRef.current = { jwt: jwt ?? null, refresh: refresh ?? null };

    if (__DEV__) {
      console.debug("[NativeAuth] Injecting tokens into WebView", {
        hasJwt: Boolean(jwt),
        hasRefresh: Boolean(refresh),
        deploymentUrl: injectDeploymentUrl,
      });
    }

    ref.injectJavaScript(
      buildWebViewAuthPostMessageScript(injectDeploymentUrl, jwt ?? null, refresh ?? null),
    );
    ref.injectJavaScript(
      buildWebViewAuthInjectScript(injectDeploymentUrl, jwt ?? null, refresh ?? null),
    );
  }, [authToken, keys.jwt, keys.refresh]);

  useEffect(() => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    syncDebounceRef.current = setTimeout(() => {
      void syncAuthToWebView();
    }, 50);
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, [authToken, syncAuthToWebView]);

  const handlePasswordSignIn = useCallback(
    async (params: Record<string, string>) => {
      const result = await signIn("password", params);
      if (!result.signingIn) {
        return false;
      }
      const jwt = await convexAuthSecureStorage.getItem(keys.jwt);
      return Boolean(jwt);
    },
    [keys.jwt, signIn],
  );

  const onWebViewMessage = useCallback(
    (raw: string) => {
      void (async () => {
        let msg: NativeAuthMessage;
        try {
          msg = JSON.parse(raw) as NativeAuthMessage;
        } catch {
          return;
        }

        if (msg.type === "native-auth:inject-ack") {
          if (__DEV__) {
            console.debug("[NativeAuth] WebView inject ack", msg);
          }
          if (!msg.hasStoredJwt && msg.hasMemoryJwt && lastInjectedRef.current.jwt) {
            if (__DEV__) {
              console.debug("[NativeAuth] JWT in memory only — retrying localStorage persist");
            }
            void syncAuthToWebView({ force: true });
          } else if (!msg.hasStoredJwt && !msg.hasMemoryJwt && lastInjectedRef.current.jwt) {
            log.error("[NativeAuth] JWT inject did not reach WebView", msg);
          }
          return;
        }

        if (msg.type === "shell-web:error") {
          const isStorageDenied = msg.message.includes("Access is denied");
          if (isStorageDenied) {
            if (__DEV__) {
              console.debug(`[WebView] ${msg.source ?? "shell"}: ${msg.message}`);
            }
            void syncAuthToWebView({ force: true });
          } else {
            log.error(`[WebView] ${msg.source ?? "shell"}: ${msg.message}`);
          }
          return;
        }

        try {
          if (msg.type === "native-auth:webview-ready") {
            if (msg.convexDeploymentUrl) {
              webConvexDeploymentUrlRef.current = msg.convexDeploymentUrl;
            }
            webViewDocumentReadyRef.current = true;
            await syncAuthToWebView({ force: true });
            if (msg.requestId) {
              respond(msg.requestId, true, { authenticated: Boolean(authToken) });
            }
            return;
          }

          if (msg.type === "native-auth:token-sync") {
            await syncAuthToWebView();
            const jwt = await convexAuthSecureStorage.getItem(keys.jwt);
            respond(msg.requestId, true, { authenticated: Boolean(jwt) });
            return;
          }

          if (msg.type === "native-auth:google-sign-in") {
            await completeNativeOAuthSignIn("google", signIn);
            await syncAuthToWebView();
            const jwt = await convexAuthSecureStorage.getItem(keys.jwt);
            respond(msg.requestId, true, { authenticated: Boolean(jwt) });
            return;
          }

          if (msg.type === "native-auth:password-sign-in") {
            const authenticated = await handlePasswordSignIn(msg.params);
            await syncAuthToWebView();
            respond(msg.requestId, true, { authenticated });
            return;
          }

          if (msg.type === "native-auth:sign-out") {
            await signOut();
            convexClient.clearAuth();
            lastInjectedRef.current = { jwt: null, refresh: null };
            await syncAuthToWebView();
            respond(msg.requestId, true, { authenticated: false });
          }
        } catch (error) {
          const message = formatNativeAuthError(error);
          if ("requestId" in msg && msg.requestId) {
            respond(msg.requestId, false, { error: message });
          }
        }
      })();
    },
    [
      authToken,
      handlePasswordSignIn,
      keys.jwt,
      respond,
      signIn,
      signOut,
      syncAuthToWebView,
    ],
  );

  const onWebViewLoadStart = useCallback(() => {
    webViewDocumentReadyRef.current = false;
    lastInjectedRef.current = { jwt: null, refresh: null };
  }, []);

  const onWebViewLoadEnd = useCallback(() => {
    webViewDocumentReadyRef.current = true;
    void syncAuthToWebView({ force: true });
    flushPendingDeliveries();
  }, [flushPendingDeliveries, syncAuthToWebView]);

  const setWebViewRef = useCallback(
    (ref: WebView | null) => {
      webViewRef.current = ref;
      if (ref) {
        flushPendingDeliveries();
      }
    },
    [flushPendingDeliveries],
  );

  const ctx = useMemo(
    () => ({ onWebViewMessage, setWebViewRef, onWebViewLoadStart, onWebViewLoadEnd }),
    [onWebViewMessage, onWebViewLoadEnd, onWebViewLoadStart, setWebViewRef],
  );

  return (
    <NativeConvexAuthBridgeContext.Provider value={ctx}>
      {children}
    </NativeConvexAuthBridgeContext.Provider>
  );
}

/**
 * Native shell auth: ConvexAuthProvider (secure store) is the single source of truth.
 * WebView receives mirrored JWTs via inject — never refreshes tokens independently.
 */
export function NativeConvexAuthBridgeProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider
      client={convexClient}
      storage={convexAuthSecureStorage}
      storageNamespace={convexDeploymentUrl}
      shouldHandleCode={false}
    >
      <NativeAuthWebViewBridgeInner>{children}</NativeAuthWebViewBridgeInner>
    </ConvexAuthProvider>
  );
}
