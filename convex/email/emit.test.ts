import { describe, expect, it } from "vitest";
import { EMAIL_EVENT_NAMES, EMAIL_EVENTS } from "./events";

describe("EMAIL_EVENTS", () => {
  it("has unique product-shaped event names", () => {
    const values = Object.values(EMAIL_EVENTS);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((name) => !name.startsWith("resend:"))).toBe(true);
  });

  it("matches the emit action validator literals", () => {
    expect([...EMAIL_EVENT_NAMES]).toEqual(Object.values(EMAIL_EVENTS));
  });
});
