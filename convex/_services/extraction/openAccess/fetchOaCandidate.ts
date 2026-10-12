/**
 * Downloads one open-access candidate (#480) and says what it really is. A `.pdf` URL often
 * serves an HTML article page or a bot wall, so the body is sniffed, not trusted from the URL.
 */

import { openAccessUserAgent } from "./OpenAccessResolver";

/** Mistral OCR accepts documents up to 50 MB. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const SNIFF_BYTES = 1024;

export type FetchedCandidate =
  | { type: "pdf"; bytes: Uint8Array<ArrayBuffer>; finalUrl: string }
  | { type: "html"; finalUrl: string }
  | { type: "unusable"; reason: string };

function head(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes.subarray(0, SNIFF_BYTES));
}

export async function fetchOaCandidate(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<FetchedCandidate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": openAccessUserAgent(),
        Accept: "application/pdf,text/html;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) {
      await res.body?.cancel();
      return { type: "unusable", reason: `HTTP ${res.status}` };
    }
    const finalUrl = res.url || url;
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_PDF_BYTES) {
      await res.body?.cancel();
      return { type: "unusable", reason: "too_large" };
    }
    if (!res.body) return { type: "unusable", reason: "empty body" };

    const reader = res.body.getReader();
    const first = await reader.read();
    if (first.done || !first.value?.byteLength) return { type: "unusable", reason: "empty body" };

    const start = head(first.value);
    if (!start.includes("%PDF-")) {
      await reader.cancel();
      const contentType = res.headers.get("content-type") ?? "";
      return contentType.includes("html") || start.trimStart().startsWith("<")
        ? { type: "html", finalUrl }
        : { type: "unusable", reason: `not a PDF (${contentType || "unknown type"})` };
    }

    const parts: Uint8Array[] = [first.value];
    let total = first.value.byteLength;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) {
        await reader.cancel();
        return { type: "unusable", reason: "too_large" };
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return { type: "pdf", bytes, finalUrl };
  } catch (error) {
    return { type: "unusable", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
