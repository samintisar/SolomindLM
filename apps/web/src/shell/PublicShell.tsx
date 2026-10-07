import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { ClusterHubLandingPage } from "@/features/landing/ClusterHubLandingPage";
import { CLUSTER_HUB_PAGES } from "@/features/landing/clusterHubPages";
import { FaqPage } from "@/features/landing/FaqPage";
import { IntentLandingPage } from "@/features/landing/IntentLandingPage";
import { INTENT_LANDING_PAGES } from "@/features/landing/intentLandingPages";
import { LandingPage } from "@/features/landing/LandingPage";
import { SeoContentPage } from "@/features/landing/SeoContentPage";
import { SEO_CONTENT_PAGES } from "@/features/landing/seoContentPages";
import { PrivacyPolicy } from "@/features/legal/components/PrivacyPolicy";
import { TermsOfService } from "@/features/legal/components/TermsOfService";
import { RouteTransition } from "@/shared/components/RouteTransition";
import { DESIGN_GALLERY_ENABLED } from "./isPublicPath";
import { loadAppShell } from "./loadAppShell";

const DesignGallery = DESIGN_GALLERY_ENABLED ? lazy(() => import("@/dev/DesignGallery")) : null;

// Sign-in showcases the studio tool grid and customize dialogs; keep those out of marketing pages.
const AuthPage = lazy(() =>
  import("@/features/auth/AuthPage").then((m) => ({ default: m.AuthPage }))
);

// Free tools: own chunk so the marketing shell doesn't ship pdfjs or the tool UI.
const PdfToFlashcardsPage = lazy(() => import("@/features/tools/pages/PdfToFlashcardsPage"));

/**
 * Marketing, legal, sign-in and free-tool routes. Mounts none of the app's data hooks or
 * providers, so these pages don't download the app bundle or subscribe to its queries.
 */
export function PublicShell({ animateOnMount }: { animateOnMount: boolean }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // A signed-in visitor (or one finishing sign-in) is headed for the app: fetch it ahead of time.
  useEffect(() => {
    if (isAuthenticated) void loadAppShell();
  }, [isAuthenticated]);

  return (
    <div className="w-full bg-background text-foreground font-serif">
      <RouteTransition fill={false} animateOnMount={animateOnMount}>
        <Routes>
          <Route path="/" element={<LandingPage onGetStarted={() => navigate("/home")} />} />
          <Route
            path="/sign-in"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <AuthPage />
              </Suspense>
            }
          />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route
            path="/tools/pdf-to-flashcards"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <PdfToFlashcardsPage />
              </Suspense>
            }
          />
          {DesignGallery && (
            <Route
              path="/dev/design"
              element={
                <Suspense fallback={null}>
                  <DesignGallery />
                </Suspense>
              }
            />
          )}

          {CLUSTER_HUB_PAGES.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={<ClusterHubLandingPage pagePath={page.path} />}
            />
          ))}

          {INTENT_LANDING_PAGES.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={<IntentLandingPage pagePath={page.path} />}
            />
          ))}

          {SEO_CONTENT_PAGES.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={<SeoContentPage pagePath={page.path} />}
            />
          ))}
        </Routes>
      </RouteTransition>
    </div>
  );
}
