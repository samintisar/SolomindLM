// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IAP_RESPONSE_EVENT,
  loadIapProducts,
  purchaseIapProduct,
  restoreIapPurchases,
} from "./iapBridge";

const posted: Array<Record<string, unknown>> = [];

function respond(detail: unknown) {
  window.dispatchEvent(new CustomEvent(IAP_RESPONSE_EVENT, { detail }));
}

beforeEach(() => {
  posted.length = 0;
  window.__IS_NATIVE_SHELL__ = true;
  window.__SHELL_CAPABILITIES__ = { iap: true };
  window.ReactNativeWebView = { postMessage: (m: string) => posted.push(JSON.parse(m)) };
});

afterEach(() => {
  delete window.__IS_NATIVE_SHELL__;
  delete window.__SHELL_CAPABILITIES__;
  delete window.ReactNativeWebView;
  vi.useRealTimers();
});

describe("iapBridge", () => {
  it("sends a products request and resolves with valid products only", async () => {
    const promise = loadIapProducts();
    expect(posted[0]).toMatchObject({ type: "shell-web:iap", action: "products" });
    respond({
      requestId: posted[0].requestId,
      ok: true,
      result: {
        products: [
          {
            id: "com.solomindlm.app.pro.monthly",
            displayPrice: "$1.99",
            price: 1.99,
            period: "month",
          },
          { id: 42 },
        ],
      },
    });
    await expect(promise).resolves.toEqual([
      { id: "com.solomindlm.app.pro.monthly", displayPrice: "$1.99", price: 1.99, period: "month" },
    ]);
  });

  it("ignores responses for other requests", async () => {
    const promise = restoreIapPurchases();
    respond({ requestId: "someone-else", ok: true, result: { restored: 9 } });
    respond({ requestId: posted[0].requestId, ok: true, result: { restored: 1 } });
    await expect(promise).resolves.toBe(1);
  });

  it("rejects with the native error", async () => {
    const promise = purchaseIapProduct("com.solomindlm.app.pro.yearly");
    expect(posted[0]).toMatchObject({
      action: "purchase",
      productId: "com.solomindlm.app.pro.yearly",
    });
    respond({ requestId: posted[0].requestId, ok: false, error: "Store unavailable" });
    await expect(promise).rejects.toThrow("Store unavailable");
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const promise = loadIapProducts();
    vi.advanceTimersByTime(15_001);
    await expect(promise).rejects.toThrow(/didn't respond/);
  });

  it("refuses when the shell has no in-app purchase", async () => {
    window.__SHELL_CAPABILITIES__ = {};
    await expect(loadIapProducts()).rejects.toThrow(/isn't available/);
    expect(posted).toHaveLength(0);
  });

  it("rejects when a reply for this request is malformed", async () => {
    const promise = loadIapProducts();
    respond({ requestId: posted[0].requestId, ok: "maybe" });
    await expect(promise).rejects.toThrow(/unexpected response/i);
  });

  it("ignores a second reply after the request settled", async () => {
    const promise = restoreIapPurchases();
    const requestId = posted[0].requestId;
    respond({ requestId, ok: true, result: { restored: 1 } });
    respond({ requestId, ok: false, error: "late" });
    await expect(promise).resolves.toBe(1);
  });

  it("rejects when the shell bridge throws on post", async () => {
    window.ReactNativeWebView = {
      postMessage: () => {
        throw new Error("webview gone");
      },
    };
    await expect(loadIapProducts()).rejects.toThrow(/couldn't reach the app/i);
  });
});
