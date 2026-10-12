/**
 * Downloads one open-access candidate (#480) and says what it really is. A `.pdf` URL often
 * serves an HTML article page or a bot wall, so the body is sniffed, not trusted from the URL.
 */

import { openAccessUserAgent } from "./OpenAccessResolver";
import { hostNeedingResolution, isBlockedIpAddress, isPublicHttpUrl } from "./publicUrl";

/** Mistral OCR accepts documents up to 50 MB. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const SNIFF_BYTES = 1024;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type FetchedCandidate =
  | { type: "pdf"; bytes: Uint8Array<ArrayBuffer>; finalUrl: string }
  | { type: "html"; finalUrl: string }
  | { type: "unusable"; reason: string };

/** UTF-8 byte order mark as latin1 decodes it. */
const BOM = String.fromCharCode(0xef, 0xbb, 0xbf);

function concat(parts: Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export interface FetchOaCandidateOptions {
  timeoutMs?: number;
  /**
   * Resolves a hostname to its addresses (Node's `dns.lookup`), so a public name pointing at a private
   * address is refused before connecting. Absent where DNS isn't available; the URL check still applies.
   */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

/** Whether `url` passes the destination policy, including what its hostname resolves to. */
async function isAllowedDestination(
  url: string,
  resolveHost: FetchOaCandidateOptions["resolveHost"]
): Promise<boolean> {
  if (!isPublicHttpUrl(url)) return false;
  const host = resolveHost ? hostNeedingResolution(url) : null;
  if (!host || !resolveHost) return true;
  const addresses = await resolveHost(host).catch(() => [] as string[]);
  return addresses.length > 0 && !addresses.some(isBlockedIpAddress);
}

function head(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes.subarray(0, SNIFF_BYTES));
}

export async function fetchOaCandidate(
  url: string,
  { timeoutMs = FETCH_TIMEOUT_MS, resolveHost }: FetchOaCandidateOptions = {}
): Promise<FetchedCandidate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    // Redirects are followed by hand so every hop passes the destination policy.
    let finalUrl = url;
    let res: Response | undefined;
    for (let hop = 0; ; hop++) {
      if (!(await isAllowedDestination(finalUrl, resolveHost))) {
        return { type: "unusable", reason: "blocked_destination" };
      }
      res = await fetch(finalUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": openAccessUserAgent(),
          Accept: "application/pdf,text/html;q=0.9,*/*;q=0.5",
        },
      });
      const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get("location") : null;
      if (!location) break;
      await res.body?.cancel();
      if (hop >= MAX_REDIRECTS) return { type: "unusable", reason: "too_many_redirects" };
      finalUrl = new URL(location, finalUrl).toString();
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { type: "unusable", reason: `HTTP ${res.status}` };
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_PDF_BYTES) {
      await res.body?.cancel();
      return { type: "unusable", reason: "too_large" };
    }
    if (!res.body) return { type: "unusable", reason: "empty body" };

    reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    let streamEnded = false;
    // Sniff the first SNIFF_BYTES, however the network happens to chunk them.
    while (total < SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }
      if (!value?.byteLength) continue;
      parts.push(value);
      total += value.byteLength;
    }
    if (total === 0) return { type: "unusable", reason: "empty body" };

    const start = head(concat(parts, total));
    if (!start.includes("%PDF-")) {
      await reader.cancel();
      const contentType = res.headers.get("content-type") ?? "";
      return contentType.includes("html") || start.replace(BOM, "").trimStart().startsWith("<")
        ? { type: "html", finalUrl }
        : { type: "unusable", reason: `not a PDF (${contentType || "unknown type"})` };
    }

    while (!streamEnded) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) {
        await reader.cancel();
        return { type: "unusable", reason: "too_large" };
      }
      parts.push(value);
    }
    if (total > MAX_PDF_BYTES) return { type: "unusable", reason: "too_large" };
    return { type: "pdf", bytes: concat(parts, total), finalUrl };
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    return { type: "unusable", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
