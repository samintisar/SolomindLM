import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

const WEB_BASE_URL = "https://app.solomindlm.com/entry";

describe("shouldLoadUrlInWebView", () => {
  it("allows a URL that starts with the web base URL", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/entry/home", WEB_BASE_URL)).toBe(
      true
    );
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

  it("allows a same-origin URL that doesn't textually start with the base URL", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/other?x=1", WEB_BASE_URL)).toBe(
      true
    );
  });

  it("denies a foreign origin", () => {
    expect(shouldLoadUrlInWebView("https://evil.example.com", WEB_BASE_URL)).toBe(false);
  });

  it("denies a malformed URL without throwing", () => {
    expect(() => shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).not.toThrow();
    expect(shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).toBe(false);
  });
});
