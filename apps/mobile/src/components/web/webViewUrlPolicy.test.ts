import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

const WEB_BASE_URL = "https://app.solomindlm.com";

describe("shouldLoadUrlInWebView", () => {
  it("allows the exact web base origin", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/home", WEB_BASE_URL)).toBe(true);
  });

  it("allows the Android emulator dev origin", () => {
    expect(shouldLoadUrlInWebView("http://10.0.2.2:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows the loopback dev origin", () => {
    expect(shouldLoadUrlInWebView("http://127.0.0.1:5173/", WEB_BASE_URL)).toBe(true);
  });

  it("allows the localhost dev origin", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows a LAN Vite origin matching 192.168.x.x:5173", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:5173/home", WEB_BASE_URL)).toBe(true);
  });

  it("denies a non-192.168 LAN IP even on the Vite port", () => {
    expect(shouldLoadUrlInWebView("http://10.0.0.5:5173/home", WEB_BASE_URL)).toBe(false);
  });

  it("denies the right LAN IP on the wrong port", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:51730/home", WEB_BASE_URL)).toBe(false);
  });

  it("allows a same-origin URL with a different path or query", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/other?x=1", WEB_BASE_URL)).toBe(true);
  });

  it("denies a foreign origin", () => {
    expect(shouldLoadUrlInWebView("https://evil.example.com", WEB_BASE_URL)).toBe(false);
  });

  it("denies a malformed URL without throwing", () => {
    expect(() => shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).not.toThrow();
    expect(shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).toBe(false);
  });

  it("denies a URL that embeds the trusted host as userinfo before a foreign host", () => {
    // A naive `url.startsWith(webBaseUrl)` check would pass here — the string
    // literally starts with the trusted origin — but a real browser resolves
    // this to host "evil.com" with "app.solomindlm.com" as the username.
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com@evil.com/", WEB_BASE_URL)).toBe(
      false
    );
  });

  it("denies a dev origin embedded as userinfo before a foreign host", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173@evil.com/", WEB_BASE_URL)).toBe(false);
  });

  it("denies a subdomain-confusion host that textually starts with the trusted origin", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com.evil.com/", WEB_BASE_URL)).toBe(
      false
    );
  });

  it("denies an http downgrade of the trusted origin", () => {
    expect(shouldLoadUrlInWebView("http://app.solomindlm.com/home", WEB_BASE_URL)).toBe(false);
  });

  it("denies a javascript: URL", () => {
    expect(shouldLoadUrlInWebView("javascript:alert(1)", WEB_BASE_URL)).toBe(false);
  });

  it("denies a javascript: URL even when webBaseUrl is itself a non-http(s) value", () => {
    // Without the http(s)-only scheme guard, URL.origin is the literal string
    // "null" for every non-special scheme, so a non-http(s) webBaseUrl would
    // make this compare equal to the "trusted" origin and incorrectly pass.
    expect(shouldLoadUrlInWebView("javascript:alert(1)", "solomindlm://app")).toBe(false);
  });
});

describe("shouldLoadUrlInWebView in production builds (__DEV__ = false)", () => {
  const globalWithDevFlag = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = globalWithDevFlag.__DEV__;

  beforeAll(() => {
    globalWithDevFlag.__DEV__ = false;
  });

  afterAll(() => {
    globalWithDevFlag.__DEV__ = originalDev;
  });

  it("denies dev and LAN origins when __DEV__ is false", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173/", WEB_BASE_URL)).toBe(false);
    expect(shouldLoadUrlInWebView("http://10.0.2.2:5173/", WEB_BASE_URL)).toBe(false);
    expect(shouldLoadUrlInWebView("http://192.168.1.42:5173/", WEB_BASE_URL)).toBe(false);
  });

  it("still allows the real web base origin when __DEV__ is false", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/home", WEB_BASE_URL)).toBe(true);
  });
});
