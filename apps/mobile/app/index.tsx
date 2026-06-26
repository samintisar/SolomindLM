import { FileUploadButton } from "@mobile/components/fileUpload/FileUploadButton";
import { WebViewScreen } from "@mobile/components/web/WebViewScreen";
import { useWebViewNavigation } from "@mobile/hooks/useWebViewNavigation";
import { useConvexAuth } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function normalizePath(p: string) {
  return p.startsWith("/") ? p : `/${p}`;
}

export default function MobileShellScreen() {
  const params = useLocalSearchParams<{ webPath?: string | string[] }>();
  const { isAuthenticated } = useConvexAuth();
  const { onUrlChange: onSignInWebUrlChange } = useWebViewNavigation();

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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <WebViewScreen
        path={path}
        onUrlChange={!isAuthenticated ? onSignInWebUrlChange : undefined}
      />
      {notebookIdForUpload ? <FileUploadButton notebookId={notebookIdForUpload} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
