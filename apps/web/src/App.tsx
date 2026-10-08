import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext";
import { FeedbackModal } from "./features/feedback/components/FeedbackModal";
import { FeedbackProvider } from "./features/feedback/FeedbackContext";
import { MotionProvider } from "./shared/components/motion";
import { ScrollToTop } from "./shared/components/ScrollToTop";
import { Toaster } from "./shared/components/ui/sonner";
import { ThemeProvider } from "./shared/contexts/ThemeContext";
import { ToastProvider } from "./shared/contexts/ToastContext";
import { RootRoutes } from "./shell/RootRoutes";
import { RouteErrorBoundary } from "./shell/RouteErrorBoundary";

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
                  <RouteErrorBoundary>
                    <RootRoutes />
                  </RouteErrorBoundary>
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
