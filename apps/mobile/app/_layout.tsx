import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import * as Sentry from "@sentry/react-native";

import { useColorScheme } from "@/components/useColorScheme";
import { ShellAuthProvider } from "@mobile/auth/AuthContext";
import { NativeConvexAuthBridgeProvider } from "@mobile/context/NativeConvexAuthBridgeContext";
import { parseMobileDeepLink } from "@mobile/services/platform/deepLinking";
import { useRegisterPushNotifications } from "@mobile/services/push/pushService";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
});

function PushNotificationsBootstrap() {
  useRegisterPushNotifications();
  return null;
}

function DeepLinkBootstrap() {
  const router = useRouter();
  useEffect(() => {
    const handle = (url: string | null) => {
      const parsed = parseMobileDeepLink(url);
      if (!parsed) return;
      if (parsed.kind === "notebook") {
        router.replace({
          pathname: "/",
          params: { webPath: `/notebook/${parsed.notebookId}` },
        });
      } else if (parsed.kind === "shareFork") {
        router.replace({
          pathname: "/",
          params: { webPath: `/share/fork/${parsed.token}` },
        });
      }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, [router]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo font bundling
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <NativeConvexAuthBridgeProvider>
      <ShellAuthProvider>
        <SafeAreaProvider>
          <RootLayoutNav />
        </SafeAreaProvider>
      </ShellAuthProvider>
    </NativeConvexAuthBridgeProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <PushNotificationsBootstrap />
      <DeepLinkBootstrap />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}
