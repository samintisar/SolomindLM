import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useConvex, useConvexAuth } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@convex/_generated/api";
import { log } from "@mobile/utils/logger";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useRegisterPushNotifications() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registered.current) return;

    let cancelled = false;

    void (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted" || cancelled) return;

        const projectId =
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
          (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
        const token = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        const platform = Platform.OS === "ios" ? "ios" : "android";
        await convex.mutation(api.push.index.registerExpoPushToken, {
          token: token.data,
          platform,
        });
        registered.current = true;
      } catch (e) {
        log.warn("Push registration skipped", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [convex, isAuthenticated]);
}
