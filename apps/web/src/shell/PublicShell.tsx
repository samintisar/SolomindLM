import { useEffect } from "react";
import { useRoutes } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { RouteTransition } from "@/shared/components/RouteTransition";
import { loadAppShell } from "./loadAppShell";
import { PUBLIC_ROUTES } from "./publicRoutes";

/**
 * Marketing, legal, sign-in and free-tool routes. Mounts none of the app's data hooks or
 * providers, so these pages don't download the app bundle or subscribe to its queries.
 */
export function PublicShell({ animateOnMount }: { animateOnMount: boolean }) {
  const { isAuthenticated } = useAuth();
  const routes = useRoutes(PUBLIC_ROUTES);

  // A signed-in visitor (or one finishing sign-in) is headed for the app: fetch it ahead of time.
  // A failed prefetch is harmless; the lazy import retries on navigation.
  useEffect(() => {
    if (isAuthenticated) loadAppShell().catch(() => undefined);
  }, [isAuthenticated]);

  return (
    <div className="w-full bg-background text-foreground font-serif">
      <RouteTransition fill={false} animateOnMount={animateOnMount}>
        {routes}
      </RouteTransition>
    </div>
  );
}
