import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { ClusterHubLandingPage } from "@/features/landing/ClusterHubLandingPage";
import { CLUSTER_HUB_PAGES } from "@/features/landing/clusterHubPages";
import { FaqPage } from "@/features/landing/FaqPage";
import { IntentLandingPage } from "@/features/landing/IntentLandingPage";
import { INTENT_LANDING_PAGES } from "@/features/landing/intentLandingPages";
import { SeoContentPage } from "@/features/landing/SeoContentPage";
import { SEO_CONTENT_PAGES } from "@/features/landing/seoContentPages";
import { PrivacyPolicy } from "@/features/legal/components/PrivacyPolicy";
import { TermsOfService } from "@/features/legal/components/TermsOfService";
import { LandingRoute } from "./LandingRoute";

/** Dev-only ui gallery (/dev/design). A build-time constant so production builds drop the chunk. */
export const DESIGN_GALLERY_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_GALLERY === "1";

const DesignGallery = DESIGN_GALLERY_ENABLED ? lazy(() => import("@/dev/DesignGallery")) : null;

// Sign-in showcases the studio tool grid and customize dialogs; keep those out of marketing pages.
const AuthPage = lazy(() =>
  import("@/features/auth/AuthPage").then((m) => ({ default: m.AuthPage }))
);

// Free tools: own chunk so the marketing shell doesn't ship pdfjs or the tool UI.
const PdfToFlashcardsPage = lazy(() => import("@/features/tools/pages/PdfToFlashcardsPage"));

const pageFallback = <div className="min-h-screen bg-background" />;

/**
 * Marketing, legal, sign-in and free-tool routes: what PublicShell renders, and (via
 * isPublicPath) which URLs get the public shell instead of the app shell.
 */
export const PUBLIC_ROUTES: RouteObject[] = [
  { path: "/", element: <LandingRoute /> },
  {
    path: "/sign-in",
    element: (
      <Suspense fallback={pageFallback}>
        <AuthPage />
      </Suspense>
    ),
  },
  { path: "/privacy", element: <PrivacyPolicy /> },
  { path: "/terms", element: <TermsOfService /> },
  { path: "/faq", element: <FaqPage /> },
  {
    path: "/tools/pdf-to-flashcards",
    element: (
      <Suspense fallback={pageFallback}>
        <PdfToFlashcardsPage />
      </Suspense>
    ),
  },
  ...(DesignGallery
    ? [
        {
          path: "/dev/design",
          element: (
            <Suspense fallback={null}>
              <DesignGallery />
            </Suspense>
          ),
        },
      ]
    : []),
  ...CLUSTER_HUB_PAGES.map((page) => ({
    path: page.path,
    element: <ClusterHubLandingPage pagePath={page.path} />,
  })),
  ...INTENT_LANDING_PAGES.map((page) => ({
    path: page.path,
    element: <IntentLandingPage pagePath={page.path} />,
  })),
  ...SEO_CONTENT_PAGES.map((page) => ({
    path: page.path,
    element: <SeoContentPage pagePath={page.path} />,
  })),
];
