// convex/freeTools/turnstile.ts
/** Server-side Cloudflare Turnstile check. Tokens are single-use and expire after 300 s. */

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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

  let response: Response;
  try {
    response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, codes: ["siteverify_unreachable"] };
  }
  if (!response.ok) return { ok: false, codes: [`siteverify_http_${response.status}`] };

  const body = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
  return body.success === true ? { ok: true } : { ok: false, codes: body["error-codes"] ?? [] };
}
