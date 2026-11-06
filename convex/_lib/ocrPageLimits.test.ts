import { describe, expect, it } from "vitest";
import {
  OCR_PAGE_LIMITS,
  ocrMonthKey,
  ocrPageCapNotice,
  ocrPageRange,
  ocrPagesToGrant,
  ocrQuotaExhaustedMessage,
} from "./ocrPageLimits";

describe("ocrPagesToGrant", () => {
  it("grants the per-file cap when the month has room", () => {
    expect(ocrPagesToGrant(OCR_PAGE_LIMITS.free, 0)).toBe(OCR_PAGE_LIMITS.free.perFile);
    expect(ocrPagesToGrant(OCR_PAGE_LIMITS.pro, 0)).toBe(OCR_PAGE_LIMITS.pro.perFile);
  });

  it("grants only what is left of the month", () => {
    const limits = { perFile: 30, perMonth: 100 };
    expect(ocrPagesToGrant(limits, 88)).toBe(12);
  });

  it("grants nothing once the month is used up, even past the limit", () => {
    const limits = { perFile: 30, perMonth: 100 };
    expect(ocrPagesToGrant(limits, 100)).toBe(0);
    expect(ocrPagesToGrant(limits, 140)).toBe(0);
  });

  it("adds bonus pages to the month, but not to the per-file cap", () => {
    const limits = { perFile: 30, perMonth: 100 };
    expect(ocrPagesToGrant(limits, 100, 50)).toBe(30);
    expect(ocrPagesToGrant(limits, 140, 50)).toBe(10);
    expect(ocrPagesToGrant(limits, 150, 50)).toBe(0);
  });

  it("keeps Free tighter than Pro", () => {
    expect(OCR_PAGE_LIMITS.free.perFile).toBeLessThan(OCR_PAGE_LIMITS.pro.perFile);
    expect(OCR_PAGE_LIMITS.free.perMonth).toBeLessThan(OCR_PAGE_LIMITS.pro.perMonth);
  });
});

describe("ocrPageRange", () => {
  it("is the zero-based range of the first n pages", () => {
    expect(ocrPageRange(30)).toBe("0-29");
    expect(ocrPageRange(1)).toBe("0");
  });

  it("rejects a non-positive count", () => {
    expect(() => ocrPageRange(0)).toThrow();
  });
});

describe("ocrMonthKey", () => {
  it("is the UTC year and month", () => {
    expect(ocrMonthKey(Date.UTC(2026, 10, 5, 12))).toBe("2026-11");
    expect(ocrMonthKey(Date.UTC(2026, 0, 31, 23, 59))).toBe("2026-01");
  });
});

describe("ocrPageCapNotice", () => {
  it("is empty when fewer pages were read than granted", () => {
    expect(
      ocrPageCapNotice({ pagesRead: 12, granted: 30, limits: OCR_PAGE_LIMITS.free, isPro: false })
    ).toBeUndefined();
  });

  it("names the per-file limit when the file hit it", () => {
    const notice = ocrPageCapNotice({
      pagesRead: 30,
      granted: 30,
      limits: OCR_PAGE_LIMITS.free,
      isPro: false,
    });
    expect(notice).toContain("first 30 pages");
    expect(notice).toContain("Pro");
  });

  it("names the monthly allowance when that ran out first", () => {
    const notice = ocrPageCapNotice({
      pagesRead: 12,
      granted: 12,
      limits: OCR_PAGE_LIMITS.free,
      isPro: false,
    });
    expect(notice).toContain("first 12 pages");
    expect(notice).toContain("this month");
  });

  it("does not upsell Pro users", () => {
    const notice = ocrPageCapNotice({
      pagesRead: OCR_PAGE_LIMITS.pro.perFile,
      granted: OCR_PAGE_LIMITS.pro.perFile,
      limits: OCR_PAGE_LIMITS.pro,
      isPro: true,
    });
    expect(notice).not.toContain("Upgrade");
  });
});

describe("Pro suggestion with a bonus", () => {
  it("drops the Pro suggestion once a bonus reaches Pro's monthly allowance", () => {
    const bonused = { perFile: 30, perMonth: OCR_PAGE_LIMITS.pro.perMonth };
    expect(ocrQuotaExhaustedMessage(bonused, false)).not.toContain("Upgrade");
    expect(
      ocrPageCapNotice({ pagesRead: 12, granted: 12, limits: bonused, isPro: false })
    ).not.toContain("Upgrade");
  });
});

describe("ocrQuotaExhaustedMessage", () => {
  it("states the monthly allowance and when it resets", () => {
    const message = ocrQuotaExhaustedMessage(OCR_PAGE_LIMITS.free, false);
    expect(message).toContain(String(OCR_PAGE_LIMITS.free.perMonth));
    expect(message).toContain("next month");
  });
});
