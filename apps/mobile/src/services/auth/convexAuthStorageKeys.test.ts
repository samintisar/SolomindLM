import { buildWebViewAuthInjectScript } from "../../components/web/buildWebViewAuthInjectScript";
import { convexAuthStorageKeys } from "./convexAuthStorageKeys";

describe("convexAuthStorageKeys", () => {
  it("strips non-alphanumeric characters from the deployment URL to build the namespace", () => {
    expect(convexAuthStorageKeys("https://foo-bar-123.convex.cloud")).toEqual({
      jwt: "__convexAuthJWT_httpsfoobar123convexcloud",
      refresh: "__convexAuthRefreshToken_httpsfoobar123convexcloud",
    });
  });

  it("preserves case — only non-alphanumeric characters are stripped", () => {
    expect(convexAuthStorageKeys("https://Foo-Bar-123.convex.cloud")).toEqual({
      jwt: "__convexAuthJWT_httpsFooBar123convexcloud",
      refresh: "__convexAuthRefreshToken_httpsFooBar123convexcloud",
    });
  });

  it("returns a key with an empty namespace for a URL of only special characters", () => {
    expect(convexAuthStorageKeys("://///")).toEqual({
      jwt: "__convexAuthJWT_",
      refresh: "__convexAuthRefreshToken_",
    });
  });

  it("derives the same key the WebView inject script actually stores the JWT under at runtime", () => {
    // Real cross-check, not a self-referential regex comparison: the inject
    // script computes its storage key by executing `CONVEX_URL.replace(...)`
    // inside the generated JS (not a static JSON literal), so the only way
    // to verify agreement is to actually run it in a stubbed environment and
    // inspect where it wrote the JWT.
    const deploymentUrl = "https://another-deployment.convex.cloud";
    const store = new Map<string, string>();
    const sandboxWindow = { dispatchEvent: () => undefined };
    const sandboxLocalStorage = {
      setItem: (key: string, value: string) => store.set(key, value),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
    };
    class SandboxCustomEvent {
      constructor(public type: string) {}
    }

    const script = buildWebViewAuthInjectScript(deploymentUrl, "some-jwt");
    new Function("window", "localStorage", "CustomEvent", script)(
      sandboxWindow,
      sandboxLocalStorage,
      SandboxCustomEvent
    );

    const keys = convexAuthStorageKeys(deploymentUrl);
    expect(store.get(keys.jwt)).toBe("some-jwt");
  });

  it("returns distinct keys for different deployment URLs", () => {
    const a = convexAuthStorageKeys("https://deployment-a.convex.cloud");
    const b = convexAuthStorageKeys("https://deployment-b.convex.cloud");

    expect(a.jwt).not.toBe(b.jwt);
    expect(a.refresh).not.toBe(b.refresh);
  });
});
