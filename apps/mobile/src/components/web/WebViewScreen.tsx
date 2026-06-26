import { useNativeConvexAuthBridge } from "@mobile/context/useNativeConvexAuthBridge";
import { isConvexDeploymentConfigured } from "@mobile/services/convex/client";
import { NATIVE_SHELL_INJECT } from "@mobile/utils/constants";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

export type WebViewScreenProps = {
  path: string;
  onUrlChange?: (url: string) => void;
};

function getWebBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_WEB_URL ?? (Constants.expoConfig?.extra?.webUrl as string);
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

export function WebViewScreen({ path, onUrlChange }: WebViewScreenProps) {
  const base = useMemo(() => getWebBaseUrl(), []);
  const { onWebViewMessage, setWebViewRef, onWebViewLoadStart, onWebViewLoadEnd } =
    useNativeConvexAuthBridge();
  const webViewRef = useRef<WebView>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    return (
      <View style={[styles.loading, { padding: 24, gap: 12 }]}>
        <Text style={{ textAlign: "center", fontWeight: "600" }}>Could not load the web app</Text>
        <Text style={{ textAlign: "center" }}>{loadError}</Text>
        <Text style={{ textAlign: "center", opacity: 0.7 }}>{uri}</Text>
        <Text style={{ textAlign: "center", opacity: 0.7 }}>
          Run `bun run dev:web` on your PC. Emulator uses http://10.0.2.2:5173; physical devices
          need your LAN IP in EXPO_PUBLIC_WEB_URL.
        </Text>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.webview}>
        <WebShellIframe uri={uri} onUrlChange={onUrlChange} onMessage={onWebViewMessage} />
      </View>
    );
  }

  return (
    <WebView
      ref={assignWebViewRef}
      source={{ uri }}
      style={styles.webview}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled={Platform.OS === "android"}
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
      onNavigationStateChange={(nav) => {
        if (nav.url) onUrlChange?.(nav.url);
      }}
      onError={() => {
        setLoadError("Network error reaching the dev server.");
      }}
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode >= 400) {
          setLoadError(`HTTP ${event.nativeEvent.statusCode} from the dev server.`);
        }
      }}
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
  onUrlChange?: (url: string) => void;
  onMessage: (raw: string) => void;
};

function WebShellIframe({ uri, onUrlChange, onMessage }: WebShellIframeProps) {
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
    onLoad: () => onUrlChange?.(uri),
  });
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
