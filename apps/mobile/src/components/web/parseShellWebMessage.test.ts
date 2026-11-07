import { parseShellWebMessage } from "./parseShellWebMessage";

describe("parseShellWebMessage", () => {
  it("parses theme messages", () => {
    expect(parseShellWebMessage('{"type":"shell-web:theme","theme":"dark"}')).toEqual({
      kind: "theme",
      theme: "dark",
    });
    expect(parseShellWebMessage('{"type":"shell-web:theme","theme":"light"}')).toEqual({
      kind: "theme",
      theme: "light",
    });
  });

  it("parses ai consent messages", () => {
    expect(parseShellWebMessage('{"type":"shell-web:ai-consent","granted":true}')).toEqual({
      kind: "aiConsent",
      granted: true,
    });
    expect(parseShellWebMessage('{"type":"shell-web:ai-consent","granted":false}')).toEqual({
      kind: "aiConsent",
      granted: false,
    });
  });

  it("returns null for non-JSON", () => {
    expect(parseShellWebMessage("not json")).toBeNull();
  });

  it("returns null for JSON that is not an object", () => {
    expect(parseShellWebMessage("null")).toBeNull();
    expect(parseShellWebMessage("42")).toBeNull();
  });

  it("returns null for unknown types (auth bridge messages)", () => {
    expect(parseShellWebMessage('{"type":"auth:token","token":"x"}')).toBeNull();
    expect(parseShellWebMessage("{}")).toBeNull();
  });

  it("returns null for malformed fields", () => {
    expect(parseShellWebMessage('{"type":"shell-web:theme","theme":"blue"}')).toBeNull();
    expect(parseShellWebMessage('{"type":"shell-web:theme"}')).toBeNull();
    expect(parseShellWebMessage('{"type":"shell-web:ai-consent","granted":"yes"}')).toBeNull();
    expect(parseShellWebMessage('{"type":"shell-web:ai-consent"}')).toBeNull();
  });
});

describe("iap requests", () => {
  it("parses each action", () => {
    expect(
      parseShellWebMessage(
        JSON.stringify({ type: "shell-web:iap", requestId: "r1", action: "products" })
      )
    ).toEqual({ kind: "iap", requestId: "r1", action: "products" });
    expect(
      parseShellWebMessage(
        JSON.stringify({
          type: "shell-web:iap",
          requestId: "r2",
          action: "purchase",
          productId: "com.solomindlm.app.pro.monthly",
        })
      )
    ).toEqual({
      kind: "iap",
      requestId: "r2",
      action: "purchase",
      productId: "com.solomindlm.app.pro.monthly",
    });
  });

  it("rejects unknown actions, missing ids and purchases without a product", () => {
    for (const msg of [
      { type: "shell-web:iap", requestId: "r", action: "refund" },
      { type: "shell-web:iap", action: "products" },
      { type: "shell-web:iap", requestId: "r", action: "purchase" },
    ]) {
      expect(parseShellWebMessage(JSON.stringify(msg))).toBeNull();
    }
  });
});
