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
    expect(
      parseMobileDeepLink("https://solomindlm.com/notebook/abc123/share/fork/xyz789")
    ).toEqual({ kind: "shareFork", token: "xyz789" });
  });

  it("returns null for an unrecognized path", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/settings")).toBeNull();
  });

  it("returns null for a null URL", () => {
    expect(parseMobileDeepLink(null)).toBeNull();
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
