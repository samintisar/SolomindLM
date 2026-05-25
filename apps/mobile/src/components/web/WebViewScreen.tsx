import { createElement, useEffect, useMemo } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";
import Constants from "expo-constants";

import { useNativeConvexAuthBridge } from "@mobile/context/useNativeConvexAuthBridge";
import { convexDeploymentUrl, isConvexDeploymentConfigured } from "@mobile/services/convex/client";
import { NATIVE_SHELL_INJECT } from "@mobile/utils/constants";
import { buildConvexAuthFlushInjectScript } from "./authFlushScript";

export type WebViewScreenProps = {
  path: string;
  onUrlChange?: (url: string) => void;
  /** When false, skips Convex token flush injection (e.g. external pages). */
  syncConvexAuth?: boolean;
};

function getWebBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_WEB_URL ?? (Constants.expoConfig?.extra?.webUrl as string);
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

export function WebViewScreen({ path, onUrlChange, syncConvexAuth = true }: WebViewScreenProps) {
  const base = useMemo(() => getWebBaseUrl(), []);
  const { onWebViewMessage } = useNativeConvexAuthBridge();

  const injectedJavaScriptBeforeContentLoaded = useMemo(() => {
    const flush =
      syncConvexAuth && isConvexDeploymentConfigured
        ? buildConvexAuthFlushInjectScript(convexDeploymentUrl)
        : "";
    return `${NATIVE_SHELL_INJECT}\n${flush}`;
  }, [syncConvexAuth]);

  if (!base) {
    return (
      <View style={[styles.loading, { padding: 24 }]}>
        <Text style={{ textAlign: "center" }}>
          Set EXPO_PUBLIC_WEB_URL in apps/mobile/.env (copy from .env.example).
        </Text>
      </View>
    );
  }
  const uri = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  // `react-native-webview` does not support the web platform — use an iframe for Expo web preview.
  if (Platform.OS === "web") {
    return (
      <View style={styles.webview}>
        <WebShellIframe uri={uri} onUrlChange={onUrlChange} onMessage={onWebViewMessage} />
      </View>
    );
  }

  return (
    <WebView
      source={{ uri }}
      style={styles.webview}
      sharedCookiesEnabled={Platform.OS === "ios"}
      javaScriptEnabled
      domStorageEnabled
      startInLoadingState
      injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
      onMessage={(event) => onWebViewMessage(event.nativeEvent.data)}
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}
      onNavigationStateChange={(nav) => {
        if (nav.url) onUrlChange?.(nav.url);
      }}
      onShouldStartLoadWithRequest={(req) => {
        if (!req.url.startsWith(base)) {
          void Linking.openURL(req.url);
          return false;
        }
        return true;
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
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
});
