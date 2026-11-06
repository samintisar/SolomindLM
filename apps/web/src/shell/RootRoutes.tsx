import { lazy, Suspense, useRef } from "react";
import { useLocation } from "react-router-dom";
import { AiConsentGate } from "@/features/aiConsent/AiConsentGate";
import { FullScreenSpinner } from "@/shared/components/FullScreenSpinner";
import { importOrReloadOnce } from "@/shared/utils/importOrReloadOnce";
import { isPublicPath } from "./isPublicPath";
import { loadAppShell } from "./loadAppShell";
import { PublicShell } from "./PublicShell";
import { useRootRedirects } from "./useRootRedirects";

const AppShell = lazy(() => importOrReloadOnce(loadAppShell, "app-shell-reloaded"));

/** Public routes render in a light shell; everything else loads the app shell on demand. */
export function RootRoutes() {
  useRootRedirects();
  const { pathname } = useLocation();
  const isPublic = isPublicPath(pathname);

  // The first shell is the initial page load: never faded. Once the visitor crosses between
  // shells, each newly mounted shell fades in like any other section change.
  const firstShellIsPublic = useRef(isPublic);
  const shellSwapped = useRef(false);
  if (isPublic !== firstShellIsPublic.current) shellSwapped.current = true;

  if (isPublic) return <PublicShell animateOnMount={shellSwapped.current} />;
  return (
    <AiConsentGate>
      <Suspense fallback={<FullScreenSpinner />}>
        <AppShell animateOnMount={shellSwapped.current} />
      </Suspense>
    </AiConsentGate>
  );
}
