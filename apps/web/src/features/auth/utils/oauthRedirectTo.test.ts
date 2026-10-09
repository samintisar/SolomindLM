import { describe, expect, it } from "vitest";
import { oauthRedirectTo } from "./oauthRedirectTo";

describe("oauthRedirectTo", () => {
  it("returns to the exact local dev server that started sign-in", () => {
    expect(oauthRedirectTo({ hostname: "localhost", origin: "http://localhost:5181" })).toBe(
      "http://localhost:5181/home"
    );
    expect(oauthRedirectTo({ hostname: "127.0.0.1", origin: "http://127.0.0.1:64402" })).toBe(
      "http://127.0.0.1:64402/home"
    );
  });

  it("stays relative everywhere else, so the server resolves it against SITE_URL", () => {
    expect(oauthRedirectTo({ hostname: "solomindlm.com", origin: "https://solomindlm.com" })).toBe(
      "/home"
    );
    expect(oauthRedirectTo({ hostname: "192.168.1.20", origin: "http://192.168.1.20:5173" })).toBe(
      "/home"
    );
  });
});
