import { lazy, Suspense, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Spinner } from "@/shared/components/ui/spinner";
import { isPublicPath } from "./isPublicPath";
import { loadAppShell } from "./loadAppShell";
import { PublicShell } from "./PublicShell";
import { useRootRedirects } from "./useRootRedirects";

const RELOADED_FOR_APP_SHELL = "app-shell-reloaded";

/**
 * A deploy since this page loaded removes its AppShell chunk (old hash → 404). Reload once to
 * pick up the new build instead of leaving a blank page; a second failure is a real error.
 */
function loadAppShellOrReload() {
  return loadAppShell().then(
    (module) => {
      try {
        sessionStorage.removeItem(RELOADED_FOR_APP_SHELL);
      } catch {
        // Storage blocked: nothing to clear.
      }
      return module;
    },
    (error: unknown) => {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOADED_FOR_APP_SHELL) === "1";
        if (!alreadyReloaded) sessionStorage.setItem(RELOADED_FOR_APP_SHELL, "1");
      } catch {
        // Storage blocked: can't guard against a reload loop, so don't reload.
      }
      if (alreadyReloaded) throw error;
      window.location.reload();
      return new Promise<never>(() => undefined);
    }
  );
}

const AppShell = lazy(loadAppShellOrReload);

function AppShellFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <span className="text-primary">
        <Spinner className="size-8" aria-label="Loading" />
      </span>
    </div>
  );
}

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
    <Suspense fallback={<AppShellFallback />}>
      <AppShell animateOnMount={shellSwapped.current} />
    </Suspense>
  );
}
