/**
 * Parsing for Content-Security-Policy violation reports sent by browsers to
 * POST /api/csp-report (the `report-uri` directive in apps/web/vercel.json).
 *
 * The endpoint is unauthenticated and its body is attacker-controlled, so everything is
 * validated, truncated and stripped of query strings before it reaches the logs.
 */

/** A real report is ~1-2 KB (mostly `original-policy`); anything bigger is not one. */
export const MAX_CSP_REPORT_BYTES = 16 * 1024;

const MAX_FIELD_LENGTH = 300;

/** Violations caused by the user's browser extensions, not by our page. */
const EXTENSION_SCHEME = /^(chrome|moz|safari|safari-web|ms-browser)-extension(:|$)/i;

export interface CspViolation {
  documentUri: string;
  blockedUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  disposition: string;
  sourceFile: string;
  lineNumber?: number;
  columnNumber?: number;
}

/**
 * Normalise a URI-ish report field for logging: http(s)/ws(s) URLs lose their query string and
 * fragment (they can carry OAuth codes, analytics client ids, etc.); CSP keywords such as
 * `inline`, `eval` and `data` pass through; everything is length-capped.
 */
export function sanitizeReportUri(value: unknown): string {
  if (typeof value !== "string") return "";
  let out = value;
  try {
    const url = new URL(value);
    if (/^(https?|wss?):$/.test(url.protocol)) out = `${url.origin}${url.pathname}`;
  } catch {
    // Not an absolute URL (keyword, scheme-only, or junk): keep as-is, truncated below.
  }
  return out.slice(0, MAX_FIELD_LENGTH);
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Turn a legacy `report-uri` body (`{ "csp-report": { "blocked-uri": ... } }`) into a flat,
 * safe-to-log record. Returns null when the payload is not a CSP report or is extension noise.
 * The original policy is deliberately dropped: it is large and identical for every report.
 */
export function parseCspReport(body: unknown): CspViolation | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const report = (body as Record<string, unknown>)["csp-report"];
  if (typeof report !== "object" || report === null || Array.isArray(report)) return null;
  const raw = report as Record<string, unknown>;

  const blockedUri = sanitizeReportUri(raw["blocked-uri"]);
  const sourceFile = sanitizeReportUri(raw["source-file"]);
  const documentUri = sanitizeReportUri(raw["document-uri"]);
  const violatedDirective = sanitizeText(raw["violated-directive"]);
  const effectiveDirective = sanitizeText(raw["effective-directive"]) || violatedDirective;

  // Nothing identifies this as a violation report.
  if (!effectiveDirective && !blockedUri) return null;

  if ([blockedUri, sourceFile, documentUri].some((uri) => EXTENSION_SCHEME.test(uri))) {
    return null;
  }

  return {
    documentUri,
    blockedUri,
    violatedDirective,
    effectiveDirective,
    disposition: sanitizeText(raw.disposition),
    sourceFile,
    lineNumber: finiteNumber(raw["line-number"]),
    columnNumber: finiteNumber(raw["column-number"]),
  };
}
