import { api } from "@convex/_generated/api";
import { log } from "@mobile/utils/logger";
import { useConvex, useConvexAuth } from "convex/react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

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

function webPathFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const notebookId = (data as Record<string, unknown>).notebookId;
  return typeof notebookId === "string" ? `/notebook/${notebookId}` : null;
}

/** Deep-links a tapped push notification into the notebook it's about, mirroring deepLinking.ts. */
export function useHandlePushNotificationResponse() {
  const router = useRouter();

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse) => {
      const webPath = webPathFromNotificationData(response.notification.request.content.data);
      if (!webPath) return;
      router.replace({ pathname: "/", params: { webPath } });
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [router]);
}
