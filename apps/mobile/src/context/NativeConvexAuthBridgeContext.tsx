import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

import { convexAuthSecureStorage } from "@mobile/services/auth/convexAuthSecureStorage";
import { convexAuthStorageKeys } from "@mobile/services/auth/convexAuthStorageKeys";
import { convexClient, convexDeploymentUrl } from "@mobile/services/convex/client";
import { NativeConvexAuthBridgeContext } from "./useNativeConvexAuthBridge";

export function NativeConvexAuthBridgeProvider({ children }: { children: ReactNode }) {
  const keys = useMemo(() => convexAuthStorageKeys(convexDeploymentUrl), []);
  const [providerKey, setProviderKey] = useState(0);

  const persistTokens = useCallback(
    async (jwt: string, refresh: string) => {
      await convexAuthSecureStorage.setItem(keys.jwt, jwt);
      await convexAuthSecureStorage.setItem(keys.refresh, refresh);
      setProviderKey((k) => k + 1);
    },
    [keys.jwt, keys.refresh]
  );

  const clearTokens = useCallback(async () => {
    try {
      await convexAuthSecureStorage.removeItem(keys.jwt);
    } catch {
      /* ignore */
    }
    try {
      await convexAuthSecureStorage.removeItem(keys.refresh);
    } catch {
      /* ignore */
    }
    setProviderKey((k) => k + 1);
  }, [keys.jwt, keys.refresh]);

  const onWebViewMessage = useCallback(
    (raw: string) => {
      try {
        const msg = JSON.parse(raw) as { type: "convex-auth-tokens"; jwt: string; refresh: string } | { type: "convex-auth-clear" };
        if (msg.type === "convex-auth-tokens" && msg.jwt && msg.refresh) {
          void persistTokens(msg.jwt, msg.refresh);
        } else if (msg.type === "convex-auth-clear") {
          void clearTokens();
        }
      } catch {
        /* non-JSON or unknown shape */
      }
    },
    [clearTokens, persistTokens]
  );

  const ctx = useMemo(() => ({ onWebViewMessage }), [onWebViewMessage]);

  return (
    <NativeConvexAuthBridgeContext.Provider value={ctx}>
      <ConvexAuthProvider
        key={providerKey}
        client={convexClient}
        storage={convexAuthSecureStorage}
        storageNamespace={convexDeploymentUrl}
        shouldHandleCode={false}
      >
        {children}
      </ConvexAuthProvider>
    </NativeConvexAuthBridgeContext.Provider>
  );
}
