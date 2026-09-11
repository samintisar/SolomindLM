import type { NativeAuthResponsePayload } from "./buildNativeAuthResponseInjectScript";
import { buildNativeAuthResponseInjectScript } from "./buildNativeAuthResponseInjectScript";

function extractDetail(script: string): unknown {
  const match = script.match(/var detail = (.*);/);
  if (!match) throw new Error("no detail assignment found in script");
  return JSON.parse(match[1]);
}

describe("buildNativeAuthResponseInjectScript", () => {
  it("embeds a success payload that round-trips through JSON.parse", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-1",
      success: true,
      authenticated: true,
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });

  it("embeds an error payload that round-trips through JSON.parse", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-2",
      success: false,
      error: "network timeout",
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });

  it("safely escapes an error message containing quotes and backslashes", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-3",
      success: false,
      error: 'bad "token"\\format',
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });
});
