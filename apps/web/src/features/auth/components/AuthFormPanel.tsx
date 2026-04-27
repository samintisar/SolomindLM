import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAuth } from "@/features/auth/AuthContext";
import { getConvexAuthUserMessage } from "@/features/auth/utils/authErrorMessage";

export type AuthFormInitialMode = "signIn" | "signUp";

type AuthStep =
  | "signIn"
  | "signUp"
  | { kind: "emailVerification"; email: string }
  | "forgot"
  | { kind: "resetVerification"; email: string };

const inputClass =
  "w-full px-3 py-2.5 rounded-lg text-sm text-foreground placeholder:text-muted-foreground bg-vintage-amber-50 border border-border/70 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 font-sans shadow-none";

interface AuthFormPanelProps {
  authError?: string;
  onAuthenticated: () => void;
  initialMode?: AuthFormInitialMode;
  /** Merged onto the card root (e.g. extra top padding when a headline overlaps). */
  className?: string;
}

export function AuthFormPanel({
  authError,
  onAuthenticated,
  initialMode = "signIn",
  className,
}: AuthFormPanelProps) {
  const { signInWithGoogle } = useAuth();
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<AuthStep>(initialMode);
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      setError("");
      await signInWithGoogle();
      onAuthenticated();
    } catch (err) {
      setError(getConvexAuthUserMessage(err, "Google sign-in failed"));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailPasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setPasswordLoading(true);
    void signIn("password", formData)
      .then(() => {
        setStep({
          kind: "emailVerification",
          email: formData.get("email") as string,
        });
      })
      .catch((err) => {
        setError(getConvexAuthUserMessage(err, "Sign-in failed"));
      })
      .finally(() => setPasswordLoading(false));
  };

  const handleEmailVerificationSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setPasswordLoading(true);
    void signIn("password", formData)
      .then(() => {
        onAuthenticated();
      })
      .catch((err) => {
        setError(getConvexAuthUserMessage(err, "Verification failed"));
      })
      .finally(() => setPasswordLoading(false));
  };

  const handleForgotSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setPasswordLoading(true);
    void signIn("password", formData)
      .then(() => {
        setStep({
          kind: "resetVerification",
          email: formData.get("email") as string,
        });
      })
      .catch((err) => {
        setError(getConvexAuthUserMessage(err, "Could not send reset code"));
      })
      .finally(() => setPasswordLoading(false));
  };

  const handleResetVerificationSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setPasswordLoading(true);
    void signIn("password", formData)
      .then(() => {
        onAuthenticated();
      })
      .catch((err) => {
        setError(getConvexAuthUserMessage(err, "Could not reset password"));
      })
      .finally(() => setPasswordLoading(false));
  };

  const modalTitle = (() => {
    if (step === "forgot") return "Reset password";
    if (typeof step === "object" && step.kind === "resetVerification") return "Enter reset code";
    if (typeof step === "object" && step.kind === "emailVerification") return "Check your email";
    if (step === "signUp") return "Create account";
    return "Sign in";
  })();

  const disableAll = googleLoading || passwordLoading;

  const btnPrimary =
    "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50";

  const btnOutline =
    "inline-flex w-full items-center justify-center gap-3 rounded-xl border-2 border-border bg-vintage-amber-100 px-4 py-3 text-sm font-medium text-vintage-amber-700 transition hover:bg-vintage-amber-200 disabled:pointer-events-none disabled:opacity-50";

  return (
    <div
      className={`rounded-2xl border border-border/90 bg-card/90 p-6 shadow-lg shadow-primary/5 backdrop-blur-sm sm:p-8${className ? ` ${className}` : ""}`}
    >
      <div className="mb-6 text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {modalTitle}
        </h2>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-vintage-red-200 bg-vintage-red-50 p-3">
          <p className="text-sm text-vintage-red-800 font-sans">{error}</p>
        </div>
      )}

      <div className="space-y-5">
        {step === "signIn" || step === "signUp" ? (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={disableAll}
              className={btnOutline}
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {googleLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                "Continue with Google"
              )}
            </button>

            <div className="relative py-0.5">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 font-sans text-sm font-medium tracking-wide text-muted-foreground">
                  Or continue with email
                </span>
              </div>
            </div>

            <form className="space-y-3" onSubmit={handleEmailPasswordSubmit}>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Enter your email"
                className={inputClass}
              />
              <div className="relative">
                <input
                  name="password"
                  type={showAuthPassword ? "text" : "password"}
                  autoComplete={step === "signUp" ? "new-password" : "current-password"}
                  required
                  placeholder="Password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  onClick={() => setShowAuthPassword((v) => !v)}
                  aria-label={showAuthPassword ? "Hide password" : "Show password"}
                >
                  {showAuthPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              <input name="flow" type="hidden" value={step === "signUp" ? "signUp" : "signIn"} />
              <button type="submit" disabled={disableAll} className={btnPrimary}>
                {passwordLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Please wait…
                  </>
                ) : step === "signUp" ? (
                  "Create account"
                ) : (
                  "Continue with email"
                )}
              </button>
            </form>

            <div className="flex flex-col gap-2 text-center text-sm font-sans">
              {step === "signIn" ? (
                <>
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setError("");
                      setStep("signUp");
                    }}
                  >
                    Create an account
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => {
                      setError("");
                      setStep("forgot");
                    }}
                  >
                    Forgot password?
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setError("");
                    setStep("signIn");
                  }}
                >
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </>
        ) : null}

        {typeof step === "object" && step.kind === "emailVerification" ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground font-sans">
              We sent an 8-digit code to{" "}
              <span className="font-medium text-foreground">{step.email}</span>. Enter it below to
              continue.
            </p>
            <form className="space-y-3" onSubmit={handleEmailVerificationSubmit}>
              <input name="email" type="hidden" value={step.email} />
              <input name="flow" type="hidden" value="email-verification" />
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="Verification code"
                className={inputClass}
              />
              <button type="submit" disabled={disableAll} className={btnPrimary}>
                {passwordLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify and continue"
                )}
              </button>
            </form>
            <button
              type="button"
              className="mx-auto block text-sm text-primary font-sans underline-offset-2 hover:underline"
              onClick={() => {
                setError("");
                setStep("signIn");
              }}
            >
              Back to sign in
            </button>
          </>
        ) : null}

        {step === "forgot" ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground font-sans">
              Enter your email and we will send you a code to reset your password.
            </p>
            <form className="space-y-3" onSubmit={handleForgotSubmit}>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email"
                className={inputClass}
              />
              <input name="flow" type="hidden" value="reset" />
              <button type="submit" disabled={disableAll} className={btnPrimary}>
                {passwordLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send code"
                )}
              </button>
            </form>
            <button
              type="button"
              className="mx-auto block text-sm text-primary font-sans underline-offset-2 hover:underline"
              onClick={() => {
                setError("");
                setStep("signIn");
              }}
            >
              Back to sign in
            </button>
          </>
        ) : null}

        {typeof step === "object" && step.kind === "resetVerification" ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground font-sans">
              Enter the code we sent to{" "}
              <span className="font-medium text-foreground">{step.email}</span> and choose a new
              password.
            </p>
            <form className="space-y-3" onSubmit={handleResetVerificationSubmit}>
              <input name="email" type="hidden" value={step.email} />
              <input name="flow" type="hidden" value="reset-verification" />
              <input
                name="code"
                type="text"
                inputMode="numeric"
                required
                placeholder="Reset code"
                className={inputClass}
              />
              <div className="relative">
                <input
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="New password"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              <button type="submit" disabled={disableAll} className={btnPrimary}>
                {passwordLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update password"
                )}
              </button>
            </form>
            <button
              type="button"
              className="mx-auto block text-sm text-primary font-sans underline-offset-2 hover:underline"
              onClick={() => {
                setError("");
                setStep("forgot");
              }}
            >
              Resend code
            </button>
          </>
        ) : null}

        {step === "signIn" || step === "signUp" ? (
          <div className="border-t border-border pt-5 text-center">
            <p className="text-sm text-muted-foreground font-sans">
              By signing in, you agree to our{" "}
              <Link
                to="/terms"
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
