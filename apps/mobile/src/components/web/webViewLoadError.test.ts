import { getLoadErrorCopy } from "./webViewLoadError";

const URI = "https://www.solomindlm.com/home";

describe("getLoadErrorCopy", () => {
  it("tells users to check their connection on a network error", () => {
    const copy = getLoadErrorCopy({ kind: "network" }, URI, false);

    expect(copy.title).toBe("Can't reach SolomindLM");
    expect(copy.message).toMatch(/internet connection/);
    expect(copy.devDetails).toBeNull();
  });

  it("includes the status code on an HTTP error", () => {
    const copy = getLoadErrorCopy({ kind: "http", status: 503 }, URI, false);

    expect(copy.message).toContain("503");
    expect(copy.devDetails).toBeNull();
  });

  it("never mentions the dev server outside development", () => {
    for (const error of [{ kind: "network" } as const, { kind: "http", status: 500 } as const]) {
      const copy = getLoadErrorCopy(error, URI, false);
      expect(`${copy.title} ${copy.message}`).not.toMatch(/dev server|dev:web|10\.0\.2\.2/);
    }
  });

  it("adds the URL and dev-server hint in development", () => {
    const copy = getLoadErrorCopy({ kind: "network" }, URI, true);

    expect(copy.devDetails).toContain(URI);
    expect(copy.devDetails).toContain("bun run dev:web");
  });
});
