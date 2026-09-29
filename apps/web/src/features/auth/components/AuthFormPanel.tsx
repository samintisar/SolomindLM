import { useAuthActions } from "@convex-dev/auth/react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { requestNativePasswordSignIn } from "@/features/auth/nativeShellAuth";
import { useAuth } from "@/features/auth/useAuth";
import { getConvexAuthUserMessage } from "@/features/auth/utils/authErrorMessage";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/components/ui/input-group";
import { Separator } from "@/shared/components/ui/separator";
import { Spinner } from "@/shared/components/ui/spinner";
import { cn } from "@/shared/utils/cn";
import { isNativeShell } from "@/utils/platformDetection";
import { GoogleIcon } from "./GoogleIcon";

export type AuthFormInitialMode = "signIn" | "signUp";

type AuthStep =
  | "signIn"
  | "signUp"
  | { kind: "emailVerification"; email: string }
  | "forgot"
  | { kind: "resetVerification"; email: string };

interface AuthFormPanelProps {
  authError?: string;
  onAuthenticated: () => void;
  initialMode?: AuthFormInitialMode;
  /** Merged onto the root wrapper around the card (layout only, e.g. margin or width). */
  className?: string;
  /** `"none"` renders without the card when a parent (e.g. the auth dialog) provides the surface. */
  chrome?: "card" | "none";
}

type AuthFormPanelContentProps = AuthFormPanelProps & {
  /** Resolves true when the user is fully signed in, false when another step is needed (e.g. email verification). */
  signInPassword: (formData: FormData) => Promise<boolean>;
};

function PasswordField(props: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  shown: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id} className="sr-only">
        {props.label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={props.id}
          name={props.name}
          type={props.shown ? "text" : "password"}
          autoComplete={props.autoComplete}
          required
          placeholder={props.placeholder}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={props.onToggle}
            aria-label={props.shown ? props.hideLabel : props.showLabel}
          >
            {props.shown ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

/** Spinner shows only for the password action; `disabled` also covers an in-flight Google sign-in. */
function SubmitButton(props: {
  loading: boolean;
  disabled: boolean;
  loadingLabel: string;
  label: string;
}) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={props.disabled}>
      {props.loading ? <Spinner aria-hidden /> : null}
      {props.loading ? props.loadingLabel : props.label}
    </Button>
  );
}

function AuthFormPanelContent({
  authError,
  onAuthenticated,
  initialMode = "signIn",
  className,
  chrome = "card",
  signInPassword,
}: AuthFormPanelContentProps) {
  const id = useId();
  const { signInWithGoogle } = useAuth();
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

  const runPasswordSignIn = async (
    formData: FormData,
    onSuccess: (authenticated: boolean) => void
  ) => {
    const authenticated = await signInPassword(formData);
    onSuccess(authenticated);
  };

  const handleEmailPasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setPasswordLoading(true);
    void runPasswordSignIn(formData, (authenticated) => {
      if (authenticated) {
        onAuthenticated();
        return;
      }
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
    void runPasswordSignIn(formData, (authenticated) => {
      if (authenticated) onAuthenticated();
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
    void runPasswordSignIn(formData, (authenticated) => {
      if (authenticated) {
        onAuthenticated();
        return;
      }
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
    void runPasswordSignIn(formData, (authenticated) => {
      if (authenticated) onAuthenticated();
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

  const content = (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {modalTitle}
      </h2>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "signIn" || step === "signUp" ? (
        <div className="flex flex-col gap-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={disableAll}
          >
            {googleLoading ? <Spinner aria-hidden /> : <GoogleIcon className="size-5" />}
            {googleLoading ? "Connecting…" : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="font-sans text-sm font-medium tracking-wide text-muted-foreground">
              Or continue with email
            </span>
            <Separator className="flex-1" />
          </div>

          <form className="flex flex-col gap-3" onSubmit={handleEmailPasswordSubmit}>
            <Field>
              <FieldLabel htmlFor={`${id}-email`} className="sr-only">
                Email
              </FieldLabel>
              <Input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Enter your email"
              />
            </Field>
            <PasswordField
              id={`${id}-password`}
              name="password"
              label="Password"
              placeholder="Password"
              autoComplete={step === "signUp" ? "new-password" : "current-password"}
              shown={showAuthPassword}
              onToggle={() => setShowAuthPassword((v) => !v)}
              showLabel="Show password"
              hideLabel="Hide password"
            />
            <input name="flow" type="hidden" value={step === "signUp" ? "signUp" : "signIn"} />
            <SubmitButton
              loading={passwordLoading}
              disabled={disableAll}
              loadingLabel="Please wait…"
              label={step === "signUp" ? "Create account" : "Continue with email"}
            />
          </form>

          <div className="flex flex-col items-center gap-1">
            {step === "signIn" ? (
              <>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setError("");
                    setStep("signUp");
                  }}
                >
                  Create an account
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setError("");
                    setStep("forgot");
                  }}
                >
                  Forgot password?
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setError("");
                  setStep("signIn");
                }}
              >
                Already have an account? Sign in
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {typeof step === "object" && step.kind === "emailVerification" ? (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            We sent an 8-digit code to{" "}
            <span className="font-medium text-foreground">{step.email}</span>. Enter it below to
            continue.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleEmailVerificationSubmit}>
            <input name="email" type="hidden" value={step.email} />
            <input name="flow" type="hidden" value="email-verification" />
            <Field>
              <FieldLabel htmlFor={`${id}-code`} className="sr-only">
                Verification code
              </FieldLabel>
              <Input
                id={`${id}-code`}
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="Verification code"
              />
            </Field>
            <SubmitButton
              loading={passwordLoading}
              disabled={disableAll}
              loadingLabel="Verifying…"
              label="Verify and continue"
            />
          </form>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="self-center"
            onClick={() => {
              setError("");
              setStep("signIn");
            }}
          >
            Back to sign in
          </Button>
        </div>
      ) : null}

      {step === "forgot" ? (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            Enter your email and we will send you a code to reset your password.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleForgotSubmit}>
            <Field>
              <FieldLabel htmlFor={`${id}-reset-email`} className="sr-only">
                Email
              </FieldLabel>
              <Input
                id={`${id}-reset-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email"
              />
            </Field>
            <input name="flow" type="hidden" value="reset" />
            <SubmitButton
              loading={passwordLoading}
              disabled={disableAll}
              loadingLabel="Sending…"
              label="Send code"
            />
          </form>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="self-center"
            onClick={() => {
              setError("");
              setStep("signIn");
            }}
          >
            Back to sign in
          </Button>
        </div>
      ) : null}

      {typeof step === "object" && step.kind === "resetVerification" ? (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            Enter the code we sent to{" "}
            <span className="font-medium text-foreground">{step.email}</span> and choose a new
            password.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleResetVerificationSubmit}>
            <input name="email" type="hidden" value={step.email} />
            <input name="flow" type="hidden" value="reset-verification" />
            <Field>
              <FieldLabel htmlFor={`${id}-reset-code`} className="sr-only">
                Reset code
              </FieldLabel>
              <Input
                id={`${id}-reset-code`}
                name="code"
                type="text"
                inputMode="numeric"
                required
                placeholder="Reset code"
              />
            </Field>
            <PasswordField
              id={`${id}-new-password`}
              name="newPassword"
              label="New password"
              placeholder="New password"
              autoComplete="new-password"
              shown={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
              showLabel="Show new password"
              hideLabel="Hide new password"
            />
            <SubmitButton
              loading={passwordLoading}
              disabled={disableAll}
              loadingLabel="Updating…"
              label="Update password"
            />
          </form>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="self-center"
            onClick={() => {
              setError("");
              setStep("forgot");
            }}
          >
            Resend code
          </Button>
        </div>
      ) : null}

      {step === "signIn" || step === "signUp" ? (
        <>
          <Separator />
          <p className="text-center font-sans text-sm text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline-offset-2 hover:text-foreground hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              to="/privacy"
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );

  // The light pin lives on a wrapper: the Card inherits its tokens without a restyle class.
  return (
    <div className={cn("auth-form-light", className)}>
      {chrome === "none" ? (
        content
      ) : (
        <Card variant="elevated">
          <CardContent>{content}</CardContent>
        </Card>
      )}
    </div>
  );
}

function AuthFormPanelWithConvexAuth(props: AuthFormPanelProps) {
  const { signIn } = useAuthActions();
  return (
    <AuthFormPanelContent
      {...props}
      signInPassword={async (formData) => {
        const result = await signIn("password", formData);
        return result.signingIn;
      }}
    />
  );
}

/** Browser uses Convex Auth actions; native shell delegates password sign-in to the host WebView bridge. */
export function AuthFormPanel(props: AuthFormPanelProps) {
  if (isNativeShell()) {
    return (
      <AuthFormPanelContent
        {...props}
        signInPassword={async (formData) => {
          const params = Object.fromEntries(formData.entries()) as Record<string, string>;
          return requestNativePasswordSignIn(params);
        }}
      />
    );
  }
  return <AuthFormPanelWithConvexAuth {...props} />;
}
