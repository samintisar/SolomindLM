import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allowedOrigins, DEV_ORIGINS, extraOrigins, siteUrl } from "./allowedOrigins";

describe("allowedOrigins", () => {
  const original = {
    SITE_URL: process.env.SITE_URL,
    CORS_EXTRA_ORIGINS: process.env.CORS_EXTRA_ORIGINS,
  };

  beforeEach(() => {
    delete process.env.SITE_URL;
    delete process.env.CORS_EXTRA_ORIGINS;
  });

  afterEach(() => {
    if (original.SITE_URL === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = original.SITE_URL;
    if (original.CORS_EXTRA_ORIGINS === undefined) delete process.env.CORS_EXTRA_ORIGINS;
    else process.env.CORS_EXTRA_ORIGINS = original.CORS_EXTRA_ORIGINS;
  });

  describe("siteUrl", () => {
    it("falls back to localhost when SITE_URL is unset", () => {
      delete process.env.SITE_URL;
      expect(siteUrl()).toBe("http://localhost:5173");
    });

    it("strips a trailing slash", () => {
      process.env.SITE_URL = "https://www.solomindlm.com/";
      expect(siteUrl()).toBe("https://www.solomindlm.com");
    });

    it("returns the value verbatim even if comma-joined (does not split)", () => {
      // Guards the bug this module exists to prevent: SITE_URL must be a single
      // origin. If someone comma-joins it, we surface it whole rather than
      // silently using the first segment.
      process.env.SITE_URL = "https://a.com,https://b.com";
      expect(siteUrl()).toBe("https://a.com,https://b.com");
    });
  });

  describe("extraOrigins", () => {
    it("is empty when CORS_EXTRA_ORIGINS is unset", () => {
      delete process.env.CORS_EXTRA_ORIGINS;
      expect(extraOrigins()).toEqual([]);
    });

    it("splits, trims, and strips trailing slashes", () => {
      process.env.CORS_EXTRA_ORIGINS = "https://solomindlm.com/, https://staging.solomindlm.com ";
      expect(extraOrigins()).toEqual(["https://solomindlm.com", "https://staging.solomindlm.com"]);
    });

    it("drops empty segments", () => {
      process.env.CORS_EXTRA_ORIGINS = "https://a.com,,";
      expect(extraOrigins()).toEqual(["https://a.com"]);
    });
  });

  describe("allowedOrigins", () => {
    it("includes dev origins plus SITE_URL plus extras, de-duped", () => {
      process.env.SITE_URL = "https://www.solomindlm.com";
      process.env.CORS_EXTRA_ORIGINS = "https://solomindlm.com";
      const result = allowedOrigins();
      for (const dev of DEV_ORIGINS) expect(result).toContain(dev);
      expect(result).toContain("https://www.solomindlm.com");
      expect(result).toContain("https://solomindlm.com");
      expect(new Set(result).size).toBe(result.length);
    });

    it("does not duplicate SITE_URL when it is already a dev origin", () => {
      process.env.SITE_URL = "http://localhost:5173";
      const result = allowedOrigins();
      expect(result.filter((o) => o === "http://localhost:5173")).toHaveLength(1);
    });
  });
});
