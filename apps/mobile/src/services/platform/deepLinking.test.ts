import { parseMobileDeepLink } from "./deepLinking";

describe("parseMobileDeepLink", () => {
  it("parses a notebook deep link", () => {
    expect(parseMobileDeepLink("solomindlm://notebook/abc123")).toEqual({
      kind: "notebook",
      notebookId: "abc123",
    });
  });

  it("parses a share-fork deep link", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/share/fork/xyz789")).toEqual({
      kind: "shareFork",
      token: "xyz789",
    });
  });

  it("prefers the fork match when both a notebook and fork segment are present", () => {
    // Fork is matched (and returned) before notebook is ever checked, so it
    // wins regardless of which segment appears earlier in the URL.
    expect(parseMobileDeepLink("https://solomindlm.com/notebook/abc123/share/fork/xyz789")).toEqual(
      { kind: "shareFork", token: "xyz789" }
    );
  });

  it("returns null for an unrecognized path", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/settings")).toBeNull();
  });

  it("returns null for a null URL", () => {
    expect(parseMobileDeepLink(null)).toBeNull();
  });

  it("returns null for an empty notebook id (truncated link)", () => {
    expect(parseMobileDeepLink("solomindlm://notebook/")).toBeNull();
  });

  it("returns null for an empty fork token (truncated link)", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/share/fork/")).toBeNull();
  });

  it("matches a notebook segment appearing inside a query parameter value", () => {
    // Known behavior, not a bug fix target: the regex scans the whole URL
    // string rather than the parsed path, so a path-shaped substring inside
    // a query value is treated as the route. The caller discards the
    // original URL and rebuilds its own path from the extracted id, so this
    // doesn't grant access to anything — see webViewUrlPolicy.ts for the
    // actual trust boundary.
    expect(parseMobileDeepLink("https://solomindlm.com/settings?return=/notebook/abc123")).toEqual({
      kind: "notebook",
      notebookId: "abc123",
    });
  });

  it("stops the notebook id capture at a query string", () => {
    expect(parseMobileDeepLink("solomindlm://notebook/abc123?ref=email")).toEqual({
      kind: "notebook",
      notebookId: "abc123",
    });
  });

  it("stops the fork token capture at a hash fragment", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/share/fork/xyz789#section")).toEqual({
      kind: "shareFork",
      token: "xyz789",
    });
  });
});
