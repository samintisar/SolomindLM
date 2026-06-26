import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { ShellAuthProvider } from "@mobile/auth/AuthContext";
import { NativeConvexAuthBridgeProvider } from "@mobile/context/NativeConvexAuthBridgeContext";
import { parseMobileDeepLink } from "@mobile/services/platform/deepLinking";
import { useRegisterPushNotifications } from "@mobile/services/push/pushService";
import * as Sentry from "@sentry/react-native";
import { useColorScheme } from "@/components/useColorScheme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
  debug: false,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  enableAutoSessionTracking: true,
  attachStacktrace: true,
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

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) {
      console.warn("[SolomindLM] Font load failed; continuing without custom fonts.", error);
      void SplashScreen.hideAsync();
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
      return;
    }
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 2_000);
    return () => clearTimeout(timeout);
  }, [loaded]);

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

export default Sentry.wrap(RootLayout);
