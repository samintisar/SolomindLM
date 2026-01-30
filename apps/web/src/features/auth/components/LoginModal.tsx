import { useState, FormEvent } from "react";
import { User, Loader2, Info, Mail, Lock, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/shared/components/ui/button";

type AuthMode = "signIn" | "signUp" | "forgotPassword";

interface LoginModalProps {
  onClose: () => void;
  authError?: string;
  initialMode?: AuthMode;
}

const inputBase =
  "w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent font-serif text-sm transition-colors";

export function LoginModal({ onClose, authError, initialMode = "signIn" }: LoginModalProps) {
  const { signIn, signUp, resetPassword, forgetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [prevAuthError, setPrevAuthError] = useState(authError);
  if (authError !== prevAuthError) {
    setError(authError || "");
    setPrevAuthError(authError);
  }

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setSuccessMessage("");
  };

  const switchMode = (newMode: AuthMode) => {
    resetForm();
    setMode(newMode);
  };

  const handleEmailPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      if (mode === "signIn") {
        await signIn(email, password);
        onClose();
      } else if (mode === "signUp") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setIsLoading(false);
          return;
        }
        await signUp(email, password, name);
        setSuccessMessage(
          `We've sent a verification link to ${email}. Check your inbox and click the link to activate your account, then sign in.`
        );
        // Keep modal open so user sees the message; they can switch to sign in or close
      } else if (mode === "forgotPassword") {
        await forgetPassword(email);
        setSuccessMessage("If an account exists with this email, you'll receive a reset link.");
        setEmail("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "signUp":
        return "Sign Up";
      case "forgotPassword":
        return "Reset Password";
      default:
        return "Sign In";
    }
  };

  const getDescription = () => {
    switch (mode) {
      case "signUp":
        return "Create an account to get started with SolomindLM";
      case "forgotPassword":
        return "Enter your email address and we'll send you a link to reset your password.";
      default:
        return "Sign in to access your notebooks and create study materials";
    }
  };

  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* Header - matches CustomizeNotebookModal pattern */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-vintage-green-100 dark:bg-vintage-green-200/30 rounded-lg ring-1 ring-vintage-green-200/50 dark:ring-vintage-green-200/30">
              <User className="w-5 h-5 text-vintage-green-700 dark:text-vintage-green-700" />
            </div>
            <h2 id="auth-modal-title" className="text-lg font-bold font-sans text-foreground">
              {getTitle()}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
            <Info className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive font-serif">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mx-4 mt-4 p-3 bg-vintage-green-50 dark:bg-vintage-green-100/50 border border-vintage-green-200 rounded-lg flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-vintage-green-700 shrink-0 mt-0.5" />
              <p className="text-sm text-vintage-green-700 font-serif">{successMessage}</p>
            </div>
            {mode === "signUp" && (
              <p className="text-xs text-vintage-green-700/90 font-serif pl-6">
                Once you've clicked the link in the email, use &quot;Sign in&quot; below to access your account.
              </p>
            )}
          </div>
        )}

        <div className="p-6 space-y-5">
          <p className="text-sm text-muted-foreground font-serif leading-relaxed">{getDescription()}</p>

          {mode !== "forgotPassword" && (
            <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
              {mode === "signUp" && (
                <div className="space-y-2">
                  <label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputBase}
                    placeholder="Your name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={`${inputBase} pl-9`}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    className={`${inputBase} pl-9`}
                    placeholder="••••••••"
                  />
                </div>
                {mode === "signUp" && (
                  <p className="text-xs text-muted-foreground font-serif">Must be at least 8 characters</p>
                )}
              </div>

              {mode === "signIn" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => switchMode("forgotPassword")}
                    className="text-sm text-primary hover:underline font-sans focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full font-sans"
                size="default"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {mode === "signUp" ? "Creating account..." : "Signing in..."}
                  </>
                ) : mode === "signUp" ? (
                  "Sign Up"
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          )}

          {mode === "forgotPassword" && (
            <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reset-email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-sans">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={`${inputBase} pl-9`}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full font-sans" size="default">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>

              <button
                type="button"
                onClick={() => switchMode("signIn")}
                className="w-full text-sm text-primary hover:underline font-sans focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded py-2"
              >
                Back to sign in
              </button>
            </form>
          )}

          {mode !== "forgotPassword" && (
            <>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-2 text-xs uppercase tracking-widest text-muted-foreground font-sans">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3 h-auto font-sans border-2 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
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
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : mode === "signUp" ? (
                  "Sign up with Google"
                ) : (
                  "Sign in with Google"
                )}
              </Button>
            </>
          )}

          {mode !== "forgotPassword" && (
            <div className="text-center pt-1">
              {mode === "signIn" ? (
                <p className="text-sm text-muted-foreground font-serif">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signUp")}
                    className="text-primary hover:underline font-sans focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground font-serif">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signIn")}
                    className="text-primary hover:underline font-sans focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="text-center pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground font-serif">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
