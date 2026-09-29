import { describe, expect, it } from "vitest";
import { assertNotProdConvexUrl } from "./prodGuard";

describe("assertNotProdConvexUrl", () => {
  it("throws when the eval URL is the prod deployment", () => {
    expect(() =>
      assertNotProdConvexUrl("https://happy-otter-123.convex.cloud", "prod:happy-otter-123")
    ).toThrow(/prod deployment "happy-otter-123"/);
  });

  it("ignores a trailing comment on CONVEX_DEPLOYMENT", () => {
    expect(() =>
      assertNotProdConvexUrl(
        "https://happy-otter-123.convex.cloud",
        "prod:happy-otter-123 # team: me, project: solomindlm"
      )
    ).toThrow();
  });

  it("allows a dev URL, a dev deployment, or no deployment", () => {
    expect(() =>
      assertNotProdConvexUrl("https://calm-fox-456.convex.cloud", "prod:happy-otter-123")
    ).not.toThrow();
    expect(() =>
      assertNotProdConvexUrl("https://calm-fox-456.convex.cloud", "dev:calm-fox-456")
    ).not.toThrow();
    expect(() =>
      assertNotProdConvexUrl("https://calm-fox-456.convex.cloud", undefined)
    ).not.toThrow();
  });
});
