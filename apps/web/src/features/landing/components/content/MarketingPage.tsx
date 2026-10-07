import { type ReactNode, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "../Footer";
import { FirstNotebookCta } from "../home/FirstNotebookCta";
import { LandingNav } from "../home/LandingNav";

interface MarketingPageProps {
  /** Page copy for the closing section; its heading and demo stay the same. */
  closing?: { body?: string; ctaLabel?: string };
  /** The page body. `openSignup` opens the sign-up modal. */
  children: (openSignup: () => void) => ReactNode;
}

/** The content-page frame: light pin, nav, main, closing section, footer and the sign-up modal. */
export function MarketingPage({ closing, children }: MarketingPageProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (isNativeShell()) {
    if (isLoading) return <div className="auth-form-light min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const openSignup = () => setAuthModalOpen(true);
  return (
    <>
      {/* Pinned light, like the home page: the marketing pages don't follow the app theme. */}
      <div className="auth-form-light min-h-screen bg-background font-serif text-foreground antialiased">
        <LandingNav onGetStarted={openSignup} onLogin={openSignup} />
        <main>
          {children(openSignup)}
          <FirstNotebookCta
            onGetStarted={openSignup}
            body={closing?.body}
            ctaLabel={closing?.ctaLabel}
          />
        </main>
        <Footer />
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => navigate("/home", { replace: true })}
      />
    </>
  );
}
