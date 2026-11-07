import { ConvexError } from "convex/values";
import { errorMessage, purchaseOutcomeFromError, toBridgeProducts } from "./iapMappers";

describe("toBridgeProducts", () => {
  it("keeps our products, adds the period, puts yearly first", () => {
    expect(
      toBridgeProducts([
        { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2.00", price: 2 },
        { id: "com.other.thing", displayPrice: "$1", price: 1 },
        { id: "com.solomindlm.app.pro.yearly", displayPrice: "$12.00", price: undefined },
      ])
    ).toEqual([
      { id: "com.solomindlm.app.pro.yearly", displayPrice: "$12.00", price: null, period: "year" },
      { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2.00", price: 2, period: "month" },
    ]);
  });
});

const CODES = { cancelled: "user-cancelled", pending: ["deferred-payment", "pending"] };

describe("purchaseOutcomeFromError", () => {
  it("treats user cancellation as cancelled", () => {
    expect(purchaseOutcomeFromError({ code: "user-cancelled", message: "x" }, CODES)).toEqual({
      status: "cancelled",
    });
  });
  it("treats Ask to Buy (deferred payment) as pending", () => {
    expect(purchaseOutcomeFromError({ code: "deferred-payment", message: "x" }, CODES)).toEqual({
      status: "pending",
    });
    expect(purchaseOutcomeFromError({ code: "pending", message: "x" }, CODES)).toEqual({
      status: "pending",
    });
  });
  it("passes other errors through", () => {
    expect(purchaseOutcomeFromError(new Error("Network down"), CODES)).toEqual({
      status: "error",
      message: "Network down",
    });
  });
});

describe("errorMessage", () => {
  it("prefers the detail of a ConvexError's data", () => {
    const error = new ConvexError({ type: "INPUT_VALIDATION_ERROR", detail: "Couldn't verify." });
    expect(errorMessage(error)).toBe("Couldn't verify.");
  });
  it("falls back to data.message", () => {
    expect(errorMessage(new ConvexError({ code: "X", message: "Pro only." }))).toBe("Pro only.");
  });
  it("maps rate limiting to friendly copy", () => {
    const error = new ConvexError({ kind: "RateLimited", name: "appStoreSync", retryAfter: 5 });
    expect(errorMessage(error)).toBe("Too many attempts. Try again later.");
  });
  it("uses the message for other errors and ConvexErrors with string data", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(new ConvexError("plain"))).toContain("plain");
    expect(errorMessage("odd")).toBe("odd");
  });
});
