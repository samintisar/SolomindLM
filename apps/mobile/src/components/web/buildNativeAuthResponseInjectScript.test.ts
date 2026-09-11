import type { NativeAuthResponsePayload } from "./buildNativeAuthResponseInjectScript";
import { buildNativeAuthResponseInjectScript } from "./buildNativeAuthResponseInjectScript";

// Greedy `(.*)` is safe here because `.` excludes not just `\n`/`\r` but also
// U+2028/U+2029, and JSON.stringify never emits `\n`/`\r` raw — so a payload
// containing a semicolon can't end the match early. (JSON.stringify *does*
// emit U+2028/U+2029 raw, which would make this throw "no detail assignment
// found" instead of extracting — fail-closed, not a false pass, just not for
// the same reason as the \n/\r case.)
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
      error: 'bad "token"\\format\nsecond line',
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });

  it("dispatches under the fixed event name the web shell listens for", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-4",
      success: true,
    };

    expect(buildNativeAuthResponseInjectScript(payload)).toContain(
      '"solomindlm-native-auth-response"'
    );
  });

  it("emits syntactically valid JavaScript", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-5",
      success: false,
      error: 'bad "token"\\format\nsecond line',
    };

    expect(() => new Function(buildNativeAuthResponseInjectScript(payload))).not.toThrow();
  });
});
