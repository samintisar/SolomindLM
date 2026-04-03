/**
 * Resend SDK returns structured error objects; turn them into clear Errors for Convex logs and the auth UI.
 */
export function throwOnResendSendError(error: unknown): never {
  const message =
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  if (message.includes("only send testing emails")) {
    throw new Error(
      "Verification email can only be sent to the address on your Resend account until you verify a domain. Use that email to test, or add a domain at resend.com/domains and set AUTH_RESEND_FROM to an address on that domain.",
    );
  }

  throw new Error(message);
}
