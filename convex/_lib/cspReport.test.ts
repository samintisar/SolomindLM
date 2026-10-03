import { describe, expect, it } from "vitest";
import { MAX_CSP_REPORT_BYTES, parseCspReport, sanitizeReportUri } from "./cspReport";

const legacyReport = (overrides: Record<string, unknown> = {}) => ({
  "csp-report": {
    "document-uri": "https://www.solomindlm.com/sign-in",
    "blocked-uri": "https://accounts.google.com/gsi/client",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    disposition: "report",
    "source-file": "https://www.solomindlm.com/assets/index-abc.js",
    "line-number": 231,
    "column-number": 19884,
    "status-code": 200,
    "original-policy": "default-src 'self'; script-src 'self'",
    ...overrides,
  },
});

describe("sanitizeReportUri", () => {
  it("strips query string and fragment from http(s) URLs", () => {
    expect(sanitizeReportUri("https://analytics.google.com/g/collect?tid=G-1&cid=42#frag")).toBe(
      "https://analytics.google.com/g/collect"
    );
  });

  it("keeps CSP keywords as-is", () => {
    expect(sanitizeReportUri("inline")).toBe("inline");
    expect(sanitizeReportUri("eval")).toBe("eval");
    expect(sanitizeReportUri("data")).toBe("data");
  });

  it("truncates very long values", () => {
    const long = `https://example.com/${"a".repeat(1000)}`;
    expect(sanitizeReportUri(long).length).toBeLessThanOrEqual(300);
  });

  it("returns an empty string for non-strings", () => {
    expect(sanitizeReportUri(undefined)).toBe("");
    expect(sanitizeReportUri(42)).toBe("");
    expect(sanitizeReportUri(null)).toBe("");
  });
});

describe("parseCspReport", () => {
  it("normalises a legacy report-uri payload", () => {
    expect(parseCspReport(legacyReport())).toEqual({
      documentUri: "https://www.solomindlm.com/sign-in",
      blockedUri: "https://accounts.google.com/gsi/client",
      violatedDirective: "script-src-elem",
      effectiveDirective: "script-src-elem",
      disposition: "report",
      sourceFile: "https://www.solomindlm.com/assets/index-abc.js",
      lineNumber: 231,
      columnNumber: 19884,
    });
  });

  it("never includes the (large) original policy", () => {
    expect(parseCspReport(legacyReport())).not.toHaveProperty("originalPolicy");
  });

  it("strips query strings so tokens are not logged", () => {
    const parsed = parseCspReport(
      legacyReport({
        "document-uri": "https://www.solomindlm.com/sign-in?code=SECRET&state=x",
        "blocked-uri": "https://stats.g.doubleclick.net/g/collect?cid=123",
      })
    );
    expect(parsed?.documentUri).toBe("https://www.solomindlm.com/sign-in");
    expect(parsed?.blockedUri).toBe("https://stats.g.doubleclick.net/g/collect");
  });

  it("falls back to violated-directive when effective-directive is missing", () => {
    const parsed = parseCspReport(
      legacyReport({ "effective-directive": undefined, "violated-directive": "img-src" })
    );
    expect(parsed?.effectiveDirective).toBe("img-src");
  });

  it("returns null for payloads that are not CSP reports", () => {
    expect(parseCspReport(null)).toBeNull();
    expect(parseCspReport("nope")).toBeNull();
    expect(parseCspReport([])).toBeNull();
    expect(parseCspReport({})).toBeNull();
    expect(parseCspReport({ "csp-report": "string" })).toBeNull();
    expect(parseCspReport({ "csp-report": {} })).toBeNull();
  });

  it("drops non-numeric line and column numbers", () => {
    const parsed = parseCspReport(legacyReport({ "line-number": "x", "column-number": null }));
    expect(parsed?.lineNumber).toBeUndefined();
    expect(parsed?.columnNumber).toBeUndefined();
  });

  it.each([
    ["chrome-extension://abcdef/content.js", "source-file"],
    ["moz-extension://1234/inject.js", "source-file"],
    ["safari-web-extension://x/y.js", "source-file"],
    ["chrome-extension://abcdef/img.png", "blocked-uri"],
    ["moz-extension", "blocked-uri"],
  ])("returns null for browser-extension noise (%s as %s)", (value, field) => {
    expect(parseCspReport(legacyReport({ [field]: value }))).toBeNull();
  });

  it("keeps inline and eval violations (they point at real app code)", () => {
    expect(parseCspReport(legacyReport({ "blocked-uri": "inline" }))?.blockedUri).toBe("inline");
    expect(parseCspReport(legacyReport({ "blocked-uri": "eval" }))?.blockedUri).toBe("eval");
  });
});

describe("MAX_CSP_REPORT_BYTES", () => {
  it("is large enough for a real report and small enough to cap abuse", () => {
    expect(MAX_CSP_REPORT_BYTES).toBeGreaterThanOrEqual(4 * 1024);
    expect(MAX_CSP_REPORT_BYTES).toBeLessThanOrEqual(64 * 1024);
  });
});
