import { describe, expect, test } from "vitest";
import { folderMeta, formatShortDate, notebookMeta } from "./notebookMeta";

// Noon local time keeps the calendar day stable across time zones.
const NOW = new Date(2026, 9, 1, 12);
const SEP_12 = new Date(2026, 8, 12, 12).getTime();
const LAST_YEAR = new Date(2025, 2, 3, 12).getTime();

describe("formatShortDate", () => {
  test("omits the year for this year", () => {
    expect(formatShortDate(SEP_12, NOW)).toBe("Sep 12");
  });
  test("includes the year for earlier years", () => {
    expect(formatShortDate(LAST_YEAR, NOW)).toBe("Mar 3, 2025");
  });
  test.each([undefined, "", "not a date"])("returns null for %s", (value) => {
    expect(formatShortDate(value, NOW)).toBeNull();
  });
});

describe("notebookMeta", () => {
  test("sources and created date", () => {
    expect(notebookMeta({ sourceCount: 16, created_at: SEP_12 }, NOW)).toBe("16 sources · Sep 12");
  });
  test("singular source", () => {
    expect(notebookMeta({ sourceCount: 1, created_at: SEP_12 }, NOW)).toBe("1 source · Sep 12");
  });
  test("no date when created_at is missing", () => {
    expect(notebookMeta({ sourceCount: 0 }, NOW)).toBe("0 sources");
  });
});

describe("folderMeta", () => {
  test("pluralizes notebooks", () => {
    expect(folderMeta({ notebookCount: 6 })).toBe("6 notebooks");
    expect(folderMeta({ notebookCount: 1 })).toBe("1 notebook");
  });
});
