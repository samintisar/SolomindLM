import { FileUploadButton } from "@mobile/components/fileUpload/FileUploadButton";
import { WebViewScreen } from "@mobile/components/web/WebViewScreen";
import { useWebViewNavigation } from "@mobile/hooks/useWebViewNavigation";
import { useConvexAuth } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Matches web's `--background` (apps/web/src/index.css) light/dark values so the status-bar inset doesn't flash the wrong color. */
const SHELL_BACKGROUND_LIGHT = "#F5F1E6";
const SHELL_BACKGROUND_DARK = "#161311";

function normalizePath(p: string) {
  return p.startsWith("/") ? p : `/${p}`;
}

export default function MobileShellScreen() {
  const params = useLocalSearchParams<{ webPath?: string | string[] }>();
  const { isAuthenticated } = useConvexAuth();
  const { onUrlChange: onSignInWebUrlChange } = useWebViewNavigation();
  // The web app owns its theme (in-app toggle, not the OS setting); it reports it via `shell-web:theme`.
  // Start light to match the web app's own default until the first report arrives.
  const [webTheme, setWebTheme] = useState<"light" | "dark">("light");

  const webPathParam = Array.isArray(params.webPath) ? params.webPath[0] : params.webPath;

  // Keep the WebView entry path stable — auth routing is handled inside the web app.
  // Changing `path` when `isAuthenticated` flips reloads the WebView and drops the session mirror.
  const path = useMemo(() => {
    if (typeof webPathParam === "string" && webPathParam.length > 0) {
      return normalizePath(webPathParam);
    }
    return "/home";
  }, [webPathParam]);

  const notebookIdForUpload = useMemo(() => {
    const m = path.match(/^\/notebook\/([^/?]+)/);
    return m ? m[1] : null;
  }, [path]);

  const shellBackground = webTheme === "dark" ? SHELL_BACKGROUND_DARK : SHELL_BACKGROUND_LIGHT;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: shellBackground }]} edges={["top"]}>
      <StatusBar style={webTheme === "dark" ? "light" : "dark"} />
      <WebViewScreen
        path={path}
        onUrlChange={!isAuthenticated ? onSignInWebUrlChange : undefined}
        onThemeChange={setWebTheme}
      />
      {notebookIdForUpload ? <FileUploadButton notebookId={notebookIdForUpload} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
