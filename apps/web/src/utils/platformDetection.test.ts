// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { canOfferPurchases, purchaseChannel, shellSupportsIap } from "./platformDetection";

afterEach(() => {
  delete window.__IS_NATIVE_SHELL__;
  delete window.__SHELL_CAPABILITIES__;
});

describe("purchaseChannel", () => {
  it("is Stripe on the web", () => {
    expect(purchaseChannel()).toBe("stripe");
    expect(canOfferPurchases()).toBe(true);
  });

  it("is none in a shell without in-app purchase (1.0 build, Android)", () => {
    window.__IS_NATIVE_SHELL__ = true;
    expect(shellSupportsIap()).toBe(false);
    expect(purchaseChannel()).toBe("none");
    expect(canOfferPurchases()).toBe(false);
  });

  it("is the App Store in a shell that reports iap", () => {
    window.__IS_NATIVE_SHELL__ = true;
    window.__SHELL_CAPABILITIES__ = { iap: true };
    expect(shellSupportsIap()).toBe(true);
    expect(purchaseChannel()).toBe("app_store");
    expect(canOfferPurchases()).toBe(true);
  });

  it("ignores the capability flag outside the shell", () => {
    window.__SHELL_CAPABILITIES__ = { iap: true };
    expect(purchaseChannel()).toBe("stripe");
  });
});
