import { notifyNativeWebViewReady } from "@/features/auth/nativeShellAuth";
import { reportShellWebError } from "@/features/auth/shellAuthMirror";
import { isNativeShell } from "@/utils/platformDetection";
import { useEffect } from "react";

/** Notifies native shell when WebView is ready; forwards web errors to native Sentry. */
export function NativeShellAuthListener() {
  useEffect(() => {
    if (!isNativeShell()) return;

    void notifyNativeWebViewReady();

    const onError = (event: ErrorEvent) => {
      const message = event.message || "Unknown error";
      const source = event.filename ? `${event.filename}:${event.lineno}` : undefined;
      reportShellWebError(message, source);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      reportShellWebError(message, "unhandledrejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
