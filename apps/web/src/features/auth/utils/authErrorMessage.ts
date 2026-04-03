/**
 * Maps @convex-dev/auth / Convex action errors to copy users can act on.
 * Server messages often look like: "[CONVEX A(auth:signIn)] Uncaught Error: InvalidAccountId"
 */
const AUTH_ERROR_MESSAGES: readonly [needle: string, message: string][] = [
  [
    "only send testing emails",
    "With Resend in test mode, codes can only be sent to your own Resend account email. For any address, verify a domain at resend.com/domains and set AUTH_RESEND_FROM to an address on that domain.",
  ],
  [
    "Missing API key",
    "We couldn't send your verification email right now. Try signing in with Google if you already use that, or try again later.",
  ],
  [
    "InvalidAccountId",
    "We couldn't find an email/password account for that address. Check the email, create an account, or use Continue with Google if that's how you signed up.",
  ],
  ["TooManyFailedAttempts", "Too many sign-in attempts. Please wait a few minutes and try again."],
  [
    "InvalidSecret",
    "That password doesn't match this account. Try again or use Forgot password to reset it.",
  ],
  ["Invalid code", "That code is incorrect or has expired. Request a new code and try again."],
  ["Invalid password", "Password must be at least 8 characters."],
  ["Invalid credentials", "Email or password is incorrect."],
];

export function getConvexAuthUserMessage(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!raw) return fallback;
  for (const [needle, message] of AUTH_ERROR_MESSAGES) {
    if (raw.includes(needle)) return message;
  }
  return fallback;
}
