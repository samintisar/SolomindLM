import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthGuard } from "@/features/auth/hooks/useAuthGuard";
import { useStripeRedirect } from "@/features/auth/hooks/useStripeRedirect";
import { useAuth } from "@/features/auth/useAuth";
import { isNativeShell } from "@/utils/platformDetection";

/**
 * Redirects that apply on every route, so they run above the public/app shell split: Stripe
 * checkout returns (which land on /), signed-in visitors on / → /home, and the native shell
 * skipping the marketing landing.
 */
export function useRootRedirects(): void {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useStripeRedirect({ isAuthenticated, user });
  useAuthGuard({ isAuthenticated, isLoading });

  useEffect(() => {
    if (!isNativeShell() || location.pathname !== "/") return;
    if (isLoading) return;
    navigate(isAuthenticated ? "/home" : "/sign-in", { replace: true });
  }, [location.pathname, isAuthenticated, isLoading, navigate]);
}
