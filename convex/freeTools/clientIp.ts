// convex/freeTools/clientIp.ts
/**
 * Caller identity for anonymous rate limiting. Only the salted hash is ever stored (as a
 * rate-limiter key) — never log or persist the raw address.
 */

function forwardedForEntries(headers: Headers): string[] {
  return (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The last `x-forwarded-for` entry: whether the edge appends to a client-supplied header or
 * overwrites it, the last entry is the one the edge itself saw.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const entries = forwardedForEntries(headers);
  if (entries.length > 0) return entries[entries.length - 1];
  return headers.get("x-real-ip")?.trim() || null;
}

/** Number of x-forwarded-for entries — logged (not the values) to confirm the edge's behaviour. */
export function forwardedForHopCount(headers: Headers): number {
  return forwardedForEntries(headers).length;
}

export async function hashClientIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
