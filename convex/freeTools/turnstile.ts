// convex/freeTools/turnstile.ts
/** Server-side Cloudflare Turnstile check. Tokens are single-use and expire after 300 s. */

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const SITEVERIFY_TIMEOUT_MS = 10_000;

export type TurnstileResult = { ok: true } | { ok: false; codes: string[] };

export async function verifyTurnstileToken(args: {
  token: string;
  secret: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const payload: Record<string, string> = { secret: args.secret, response: args.token };
  if (args.remoteIp) payload.remoteip = args.remoteIp;

  // AbortController + setTimeout rather than AbortSignal.timeout: the latter is not guaranteed in
  // Convex's default V8 runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEVERIFY_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, codes: ["siteverify_unreachable"] };
    }
    if (!response.ok) return { ok: false, codes: [`siteverify_http_${response.status}`] };

    let body: { success?: unknown; "error-codes"?: unknown } | null;
    try {
      body = await response.json();
    } catch {
      return { ok: false, codes: ["siteverify_bad_response"] };
    }
    if (body?.success === true) return { ok: true };
    const rawCodes = body?.["error-codes"];
    const codes = Array.isArray(rawCodes)
      ? rawCodes.filter((code): code is string => typeof code === "string")
      : [];
    return { ok: false, codes };
  } finally {
    clearTimeout(timer);
  }
}
