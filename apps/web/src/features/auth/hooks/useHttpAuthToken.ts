import { useAuthToken } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { getShellConvexDeploymentUrl, readShellJwt } from "@/features/auth/shellAuthMirror";
import { isNativeShell } from "@/utils/platformDetection";

/**
 * JWT for Convex HTTP actions (chat stream, research execute).
 * The native WebView shell mirrors tokens via `ShellWebConvexAuthProvider`, not
 * `ConvexAuthProvider`, so `useAuthToken()` is always null there.
 */
export function useHttpAuthToken(): string | null {
  const browserToken = useAuthToken();
  const [shellTokenVersion, setShellTokenVersion] = useState(0);

  useEffect(() => {
    if (!isNativeShell()) return;
    const bump = () => setShellTokenVersion((v) => v + 1);
    window.addEventListener("solomindlm-native-auth-sync", bump);
    return () => window.removeEventListener("solomindlm-native-auth-sync", bump);
  }, []);

  if (isNativeShell()) {
    void shellTokenVersion;
    return readShellJwt(getShellConvexDeploymentUrl());
  }

  return browserToken;
}
