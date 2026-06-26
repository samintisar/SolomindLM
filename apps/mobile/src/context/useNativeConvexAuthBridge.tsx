import { createContext, useContext } from "react";
import type WebView from "react-native-webview";

export type NativeConvexAuthBridgeContextValue = {
  onWebViewMessage: (raw: string) => void;
  setWebViewRef: (ref: WebView | null) => void;
  onWebViewLoadStart: () => void;
  onWebViewLoadEnd: () => void;
};

export const NativeConvexAuthBridgeContext =
  createContext<NativeConvexAuthBridgeContextValue | null>(null);

export function useNativeConvexAuthBridge(): NativeConvexAuthBridgeContextValue {
  const value = useContext(NativeConvexAuthBridgeContext);
  if (!value) {
    throw new Error("useNativeConvexAuthBridge requires NativeConvexAuthBridgeProvider");
  }
  return value;
}
