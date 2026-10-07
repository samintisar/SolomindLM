import { describe, expect, it } from "vitest";
import { assertNotProdConvexUrl, requireEvalConvexEnv } from "./prodGuard";

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

  it("reports an invalid eval URL clearly", () => {
    expect(() => assertNotProdConvexUrl("not a url", "prod:happy-otter-123")).toThrow(
      "RAG_EVAL_CONVEX_URL is not a valid URL: not a url"
    );
  });
});

describe("requireEvalConvexEnv", () => {
  const url = "https://calm-fox-456.convex.cloud";

  it("returns the trimmed URL and secret", () => {
    expect(
      requireEvalConvexEnv({ RAG_EVAL_CONVEX_URL: ` ${url} `, RAG_EVAL_SECRET: " secret " })
    ).toEqual({ convexUrl: url, evalSecret: "secret" });
  });

  it("requires both variables", () => {
    expect(() => requireEvalConvexEnv({ RAG_EVAL_SECRET: "secret" })).toThrow(
      /RAG_EVAL_CONVEX_URL/
    );
    expect(() => requireEvalConvexEnv({ RAG_EVAL_CONVEX_URL: url, RAG_EVAL_SECRET: " " })).toThrow(
      /RAG_EVAL_SECRET/
    );
  });

  it("refuses the prod deployment", () => {
    expect(() =>
      requireEvalConvexEnv({
        RAG_EVAL_CONVEX_URL: url,
        RAG_EVAL_SECRET: "secret",
        CONVEX_DEPLOYMENT: "prod:calm-fox-456",
      })
    ).toThrow(/prod deployment/);
  });
});
