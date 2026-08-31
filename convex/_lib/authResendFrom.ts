/**
 * Production must not send from Resend's shared test domain.
 * Returns null when the send should be skipped (fail closed).
 */
export function resolveAuthResendFrom(): string | null {
  const from = process.env.AUTH_RESEND_FROM ?? "Solomind <onboarding@resend.dev>";
  const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
  const isProd = deployment.startsWith("prod:");
  if (isProd && from.includes("@resend.dev")) {
    console.error(
      "[email] AUTH_RESEND_FROM is still the Resend test domain in production; skipping send"
    );
    return null;
  }
  return from;
}

export function resolveTransactionalFrom(): string {
  return (
    process.env.RESEND_TRANSACTIONAL_FROM ??
    process.env.AUTH_RESEND_FROM ??
    "Solomind <onboarding@resend.dev>"
  );
}
