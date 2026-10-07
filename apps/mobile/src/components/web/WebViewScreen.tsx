import { useNativeConvexAuthBridge } from "@mobile/context/useNativeConvexAuthBridge";
import { isConvexDeploymentConfigured } from "@mobile/services/convex/client";
import { NATIVE_SHELL_INJECT } from "@mobile/utils/constants";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { getLoadErrorCopy, type WebViewLoadError } from "./webViewLoadError";
import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

export type WebViewScreenProps = {
  path: string;
  /** Called when the web app reports its active theme (`shell-web:theme`). */
  onThemeChange?: (theme: "light" | "dark") => void;
  /** Active web theme, so native-only screens (load error) stay readable on the shell background. */
  theme?: "light" | "dark";
};

function getWebBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_WEB_URL ?? (Constants.expoConfig?.extra?.webUrl as string);
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

export function WebViewScreen({ path, onThemeChange, theme = "light" }: WebViewScreenProps) {
  const base = useMemo(() => getWebBaseUrl(), []);
  const {
    onWebViewMessage: onAuthBridgeMessage,
    setWebViewRef,
    onWebViewLoadStart,
    onWebViewLoadEnd,
  } = useNativeConvexAuthBridge();

  const onWebViewMessage = useCallback(
    (raw: string) => {
      try {
        const msg = JSON.parse(raw) as { type?: string; theme?: unknown };
        if (msg?.type === "shell-web:theme") {
          if (msg.theme === "light" || msg.theme === "dark") onThemeChange?.(msg.theme);
          return;
        }
      } catch {
        /* not JSON — let the auth bridge decide */
      }
      onAuthBridgeMessage(raw);
    },
    [onAuthBridgeMessage, onThemeChange]
  );
  const webViewRef = useRef<WebView>(null);
  const [loadError, setLoadError] = useState<WebViewLoadError | null>(null);
  // Bumped to remount the WebView after the OS kills its content/render process.
  const [webViewKey, setWebViewKey] = useState(0);
  const remountWebView = useCallback(() => setWebViewKey((key) => key + 1), []);

  const assignWebViewRef = useCallback(
    (ref: WebView | null) => {
      webViewRef.current = ref;
      setWebViewRef(ref);
    },
    [setWebViewRef]
  );

  const setWebViewRefRef = useRef(setWebViewRef);
  setWebViewRefRef.current = setWebViewRef;

  useEffect(() => {
    setLoadError(null);
  }, [path, base]);

  useEffect(() => {
    return () => setWebViewRefRef.current(null);
  }, []);

  const injectedJavaScriptBeforeContentLoaded = useMemo(() => {
    if (!isConvexDeploymentConfigured) return NATIVE_SHELL_INJECT;
    return NATIVE_SHELL_INJECT;
  }, []);

  if (!base) {
    return (
      <View style={[styles.loading, { padding: 24 }]}>
        <Text style={{ textAlign: "center" }}>
          Set EXPO_PUBLIC_WEB_URL in apps/mobile/.env.local (see .env.local.example).
        </Text>
      </View>
    );
  }

  const uri = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  if (loadError) {
    const copy = getLoadErrorCopy(loadError, uri, __DEV__);
    const textColor = theme === "dark" ? TEXT_DARK : TEXT_LIGHT;
    return (
      <View style={[styles.loading, { padding: 24, gap: 12 }]}>
        <Text style={[styles.errorTitle, { color: textColor }]}>{copy.title}</Text>
        <Text style={{ textAlign: "center", color: textColor }}>{copy.message}</Text>
        {/* Clearing the error renders a fresh WebView, which retries the load. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setLoadError(null)}
          style={[styles.retryButton, { borderColor: textColor }]}
        >
          <Text style={{ color: textColor, fontWeight: "600" }}>Try again</Text>
        </Pressable>
        {copy.devDetails ? (
          <Text style={{ textAlign: "center", color: textColor, opacity: 0.7 }}>
            {copy.devDetails}
          </Text>
        ) : null}
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.webview}>
        <WebShellIframe uri={uri} onMessage={onWebViewMessage} />
      </View>
    );
  }

  return (
    <WebView
      key={webViewKey}
      ref={assignWebViewRef}
      source={{ uri }}
      style={styles.webview}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled={Platform.OS === "android"}
      allowsBackForwardNavigationGestures={Platform.OS === "ios"}
      javaScriptEnabled
      domStorageEnabled
      startInLoadingState
      injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
      onMessage={(event) => onWebViewMessage(event.nativeEvent.data)}
      onLoadStart={() => onWebViewLoadStart()}
      onLoadEnd={() => onWebViewLoadEnd()}
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}
      onError={() => {
        setLoadError({ kind: "network" });
      }}
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode >= 400) {
          setLoadError({ kind: "http", status: event.nativeEvent.statusCode });
        }
      }}
      // iOS kills WebView content processes under memory pressure (blank page); an
      // unhandled Android render-process crash takes the whole app down.
      onContentProcessDidTerminate={remountWebView}
      onRenderProcessGone={remountWebView}
      onShouldStartLoadWithRequest={(req) => {
        // Allow scripts, stylesheets, fonts, etc. — only intercept top-level navigations.
        if (!req.isTopFrame) {
          return true;
        }
        if (shouldLoadUrlInWebView(req.url, base)) {
          return true;
        }
        void Linking.openURL(req.url);
        return false;
      }}
    />
  );
}

type WebShellIframeProps = {
  uri: string;
  onMessage: (raw: string) => void;
};

function WebShellIframe({ uri, onMessage }: WebShellIframeProps) {
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        onMessage(event.data);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);

  return createElement("iframe", {
    src: uri,
    title: "SolomindLM",
    style: {
      border: "none",
      width: "100%",
      height: "100%",
      flex: 1,
      minHeight: 0,
    },
  });
}

/** Error-screen text, readable on the shell's light/dark backgrounds (app/index.tsx). */
const TEXT_LIGHT = "#161311";
const TEXT_DARK = "#F5F1E6";

const styles = StyleSheet.create({
  webview: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorTitle: { textAlign: "center", fontWeight: "600", fontSize: 17 },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
});
