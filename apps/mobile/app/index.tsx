import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTheme } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useConvexAuth } from "convex/react";

import { WebViewScreen } from "@mobile/components/web/WebViewScreen";
import { useWebViewNavigation } from "@mobile/hooks/useWebViewNavigation";
import { FileUploadButton } from "@mobile/components/fileUpload/FileUploadButton";

function normalizePath(p: string) {
  return p.startsWith("/") ? p : `/${p}`;
}

export default function MobileShellScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ webPath?: string | string[] }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { onUrlChange: onSignInWebUrlChange } = useWebViewNavigation();

  const webPathParam = Array.isArray(params.webPath) ? params.webPath[0] : params.webPath;

  const path = useMemo(() => {
    if (typeof webPathParam === "string" && webPathParam.length > 0) {
      return normalizePath(webPathParam);
    }
    if (!isAuthenticated) {
      return "/sign-in";
    }
    return "/home";
  }, [webPathParam, isAuthenticated]);

  const notebookIdForUpload = useMemo(() => {
    const m = path.match(/^\/notebook\/([^/?]+)/);
    return m ? m[1] : null;
  }, [path]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebViewScreen
        path={path}
        onUrlChange={!isAuthenticated ? onSignInWebUrlChange : undefined}
      />
      {notebookIdForUpload ? <FileUploadButton notebookId={notebookIdForUpload} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
});
