import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import React, { lazy, Suspense, useRef } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext";
import { FeedbackModal } from "./features/feedback/components/FeedbackModal";
import { FeedbackProvider } from "./features/feedback/FeedbackContext";
import { MotionProvider } from "./shared/components/motion";
import { ScrollToTop } from "./shared/components/ScrollToTop";
import { Toaster } from "./shared/components/ui/sonner";
import { Spinner } from "./shared/components/ui/spinner";
import { ThemeProvider } from "./shared/contexts/ThemeContext";
import { ToastProvider } from "./shared/contexts/ToastContext";
import { isPublicPath } from "./shell/isPublicPath";
import { loadAppShell } from "./shell/loadAppShell";
import { PublicShell } from "./shell/PublicShell";
import { useRootRedirects } from "./shell/useRootRedirects";

const AppShell = lazy(loadAppShell);

const AppShellFallback: React.FC = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background">
    <span className="text-primary">
      <Spinner className="size-8" aria-label="Loading" />
    </span>
  </div>
);

/** Public routes render in a light shell; everything else loads the app shell on demand. */
const RootRoutes: React.FC = () => {
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
};

const App: React.FC = () => {
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <BrowserRouter>
        <ScrollToTop />
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>
              <ToastProvider>
                <FeedbackProvider>
                  <RootRoutes />
                  <FeedbackModal />
                </FeedbackProvider>
                <Toaster position="bottom-right" />
              </ToastProvider>
            </AuthProvider>
          </MotionProvider>
        </ThemeProvider>
      </BrowserRouter>
    </>
  );
};

export default App;
