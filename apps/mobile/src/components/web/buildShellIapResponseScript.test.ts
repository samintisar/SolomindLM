import { buildShellIapResponseScript } from "./buildShellIapResponseScript";

describe("buildShellIapResponseScript", () => {
  it("dispatches the response event with the payload", () => {
    const dispatched: unknown[] = [];
    const fakeWindow = {
      dispatchEvent: (event: { type: string; detail: unknown }) => dispatched.push(event),
    };
    class FakeCustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    }
    const script = buildShellIapResponseScript({
      requestId: "r1",
      ok: true,
      result: { restored: 2 },
    });
    new Function("window", "CustomEvent", script)(fakeWindow, FakeCustomEvent);
    expect(dispatched).toEqual([
      {
        type: "solomindlm-shell-iap-response",
        detail: { requestId: "r1", ok: true, result: { restored: 2 } },
      },
    ]);
  });

  it("escapes payloads that contain script-breaking text", () => {
    const script = buildShellIapResponseScript({
      requestId: "r",
      ok: false,
      error: "</script>\u2028\u2029",
    });
    expect(script).not.toContain("</script>");
    expect(script).not.toContain("\u2028");
    expect(script).not.toContain("\u2029");
  });
});
