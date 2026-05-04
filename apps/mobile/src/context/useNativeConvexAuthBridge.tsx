import {
  createContext,
  useContext,
} from "react";

export type NativeConvexAuthBridgeContextValue = {
  onWebViewMessage: (raw: string) => void;
};

export const NativeConvexAuthBridgeContext = createContext<NativeConvexAuthBridgeContextValue | null>(
  null
);

export function useNativeConvexAuthBridge(): NativeConvexAuthBridgeContextValue {
  const v = useContext(NativeConvexAuthBridgeContext);
  if (!v) {
    throw new Error("useNativeConvexAuthBridge requires NativeConvexAuthBridgeProvider");
  }
  return v;
}
