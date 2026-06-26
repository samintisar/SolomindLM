import { useCallback, useEffect, useState } from "react";
import { requestNativeTokenSync } from "@/features/auth/nativeShellAuth";
import {
  applyShellAuthTokens,
  getShellConvexDeploymentUrl,
  parseShellAuthTokenPayload,
  readShellJwt,
} from "@/features/auth/shellAuthMirror";

const NATIVE_SYNC_TIMEOUT_MS = 3000;

/**
 * WebView shell auth: mirror JWT from native inject / postMessage only.
 * ConvexProviderWithAuth calls setAuth — this hook must NOT call setAuth itself.
 */
export function useShellWebConvexAuth() {
  const deploymentUrl = getShellConvexDeploymentUrl();
  const [tokenVersion, setTokenVersion] = useState(0);
  const [initialSyncDone, setInitialSyncDone] = useState(
    () => readShellJwt(deploymentUrl) !== null
  );

  const bumpTokenVersion = useCallback(() => {
    setTokenVersion((v) => v + 1);
    setInitialSyncDone(true);
  }, []);

  useEffect(() => {
    const onSync = () => bumpTokenVersion();

    const onMessage = (event: Event) => {
      const payload = parseShellAuthTokenPayload((event as MessageEvent).data);
      if (!payload) return;
      applyShellAuthTokens(payload.deploymentUrl, payload.jwt);
      bumpTokenVersion();
    };

    window.addEventListener("solomindlm-native-auth-sync", onSync);
    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage);

    if (readShellJwt(deploymentUrl)) {
      setInitialSyncDone(true);
    }

    const timeout = window.setTimeout(() => setInitialSyncDone(true), NATIVE_SYNC_TIMEOUT_MS);

    return () => {
      window.removeEventListener("solomindlm-native-auth-sync", onSync);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
    };
  }, [bumpTokenVersion, deploymentUrl]);

  const fetchAccessToken = useCallback(
    async (args: { forceRefreshToken: boolean }): Promise<string | null> => {
      if (args.forceRefreshToken) {
        void requestNativeTokenSync().catch(() => {});
      }
      return readShellJwt(deploymentUrl);
    },
    [deploymentUrl, tokenVersion]
  );

  const mirroredJwt = readShellJwt(deploymentUrl);

  return {
    isLoading: !initialSyncDone && mirroredJwt === null,
    isAuthenticated: mirroredJwt !== null,
    fetchAccessToken,
  };
}
