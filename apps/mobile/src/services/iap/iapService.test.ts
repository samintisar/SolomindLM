jest.mock("expo-iap", () => ({
  ErrorCode: {
    UserCancelled: "user-cancelled",
    DeferredPayment: "deferred-payment",
    Pending: "pending",
  },
  initConnection: jest.fn(),
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(),
  finishTransaction: jest.fn(),
  getAvailablePurchases: jest.fn(),
  restorePurchases: jest.fn(),
  deepLinkToSubscriptions: jest.fn(),
  purchaseUpdatedListener: jest.fn(),
}));
jest.mock("@mobile/services/convex/client", () => ({
  convexClient: { action: jest.fn(), mutation: jest.fn() },
}));

import { convexClient } from "@mobile/services/convex/client";
import * as iap from "expo-iap";
import { purchase, restorePurchases, startIapListeners, syncCurrentPurchases } from "./iapService";

const MONTHLY = "com.solomindlm.app.pro.monthly";
const action = convexClient.action as unknown as jest.Mock;
const mutation = convexClient.mutation as unknown as jest.Mock;
const mockedIap = iap as unknown as Record<string, jest.Mock>;

function tx(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    productId: MONTHLY,
    purchaseToken: `jws-${id}`,
    purchaseState: "purchased",
    transactionDate: Date.now(),
    ...extra,
  };
}

/** Lets queued promise callbacks run. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedIap.initConnection.mockResolvedValue(true);
  mockedIap.finishTransaction.mockResolvedValue(undefined);
  mockedIap.restorePurchases.mockResolvedValue(undefined);
  mutation.mockResolvedValue("account-token");
  action.mockResolvedValue(undefined);
});

describe("purchase", () => {
  it("rejects a second purchase while one is in flight, even before the first awaits anything", async () => {
    let release: (value: unknown) => void = () => {};
    mockedIap.requestPurchase.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const first = purchase(MONTHLY);
    await expect(purchase(MONTHLY)).resolves.toEqual({
      status: "error",
      message: "A purchase is already in progress.",
    });
    release(tx("t1"));
    await expect(first).resolves.toEqual({ status: "purchased" });
    expect(mockedIap.requestPurchase).toHaveBeenCalledTimes(1);
  });

  it("frees the slot when setup fails", async () => {
    mutation.mockRejectedValueOnce(new Error("offline"));
    await expect(purchase(MONTHLY)).resolves.toEqual({ status: "error", message: "offline" });
    mockedIap.requestPurchase.mockResolvedValue(tx("t2"));
    await expect(purchase(MONTHLY)).resolves.toEqual({ status: "purchased" });
  });

  it("settles purchased from requestPurchase's return value, syncing before finishing", async () => {
    const order: string[] = [];
    action.mockImplementation(async () => void order.push("sync"));
    mockedIap.finishTransaction.mockImplementation(async () => void order.push("finish"));
    mockedIap.requestPurchase.mockResolvedValue(tx("t3"));
    await expect(purchase(MONTHLY)).resolves.toEqual({ status: "purchased" });
    expect(action).toHaveBeenCalledWith(expect.anything(), { signedTransaction: "jws-t3" });
    expect(order).toEqual(["sync", "finish"]);
  });

  it("reports an error and does not finish when the sync fails", async () => {
    action.mockRejectedValue(new Error("verification failed"));
    mockedIap.requestPurchase.mockResolvedValue(tx("t4"));
    await expect(purchase(MONTHLY)).resolves.toEqual({
      status: "error",
      message: "verification failed",
    });
    expect(mockedIap.finishTransaction).not.toHaveBeenCalled();
  });

  it("maps a deferred payment (Ask to Buy) to pending", async () => {
    mockedIap.requestPurchase.mockRejectedValue({ code: "deferred-payment", message: "deferred" });
    await expect(purchase(MONTHLY)).resolves.toEqual({ status: "pending" });
  });

  it("maps cancellation to cancelled", async () => {
    mockedIap.requestPurchase.mockRejectedValue({ code: "user-cancelled", message: "x" });
    await expect(purchase(MONTHLY)).resolves.toEqual({ status: "cancelled" });
  });

  it("syncs a transaction once when the listener and requestPurchase both deliver it", async () => {
    let listener: (p: unknown) => void = () => {};
    mockedIap.purchaseUpdatedListener.mockImplementation((fn: (p: unknown) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    });
    startIapListeners();
    let release: (value: unknown) => void = () => {};
    mockedIap.requestPurchase.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const outcome = purchase(MONTHLY);
    await flush();
    listener(tx("t5"));
    release(tx("t5"));
    await expect(outcome).resolves.toEqual({ status: "purchased" });
    await flush();
    expect(action).toHaveBeenCalledTimes(1);
    expect(mockedIap.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it("doesn't answer the page with an older redelivered transaction of the same product", async () => {
    let listener: (p: unknown) => void = () => {};
    mockedIap.purchaseUpdatedListener.mockImplementation((fn: (p: unknown) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    });
    startIapListeners();
    let release: (value: unknown) => void = () => {};
    mockedIap.requestPurchase.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const outcome = purchase(MONTHLY);
    await flush();
    listener(tx("old", { transactionDate: Date.now() - 60 * 60 * 1000 }));
    await flush();
    // Synced quietly, but the page still waits for its own purchase.
    expect(action).toHaveBeenCalledWith(expect.anything(), { signedTransaction: "jws-old" });
    release(undefined); // StoreKit answered without a purchase: the listener must deliver it
    const settled = await Promise.race([outcome, flush().then(() => "waiting")]);
    expect(settled).toBe("waiting");
    listener(tx("new"));
    await expect(outcome).resolves.toEqual({ status: "purchased" });
  });

  it("clears the pending purchase after five minutes without an answer", async () => {
    jest.useFakeTimers();
    try {
      mockedIap.requestPurchase.mockReturnValue(new Promise(() => {}));
      const outcome = purchase(MONTHLY);
      await flush();
      jest.advanceTimersByTime(5 * 60 * 1000);
      await expect(outcome).resolves.toEqual({
        status: "error",
        message: "The App Store didn't respond. Try again.",
      });
      mockedIap.requestPurchase.mockResolvedValue(tx("t6"));
      await expect(purchase(MONTHLY)).resolves.toEqual({ status: "purchased" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("restore", () => {
  it("asks the store to sync, then counts successes and tolerates partial failures", async () => {
    mockedIap.getAvailablePurchases.mockResolvedValue([
      tx("a"),
      tx("b"),
      { ...tx("c"), productId: "com.other" },
    ]);
    action.mockRejectedValueOnce(new Error("first failed")).mockResolvedValue(undefined);
    await expect(restorePurchases()).resolves.toBe(1);
    expect(mockedIap.restorePurchases).toHaveBeenCalledTimes(1);
  });

  it("still syncs available purchases when the store sync fails", async () => {
    mockedIap.restorePurchases.mockRejectedValue(new Error("store sync failed"));
    mockedIap.getAvailablePurchases.mockResolvedValue([tx("a")]);
    await expect(restorePurchases()).resolves.toBe(1);
  });

  it("rethrows the store sync error when it failed and nothing was restored", async () => {
    mockedIap.restorePurchases.mockRejectedValue(new Error("store sync failed"));
    mockedIap.getAvailablePurchases.mockResolvedValue([]);
    await expect(restorePurchases()).rejects.toThrow("store sync failed");
  });

  it("throws the first error when every purchase failed", async () => {
    mockedIap.getAvailablePurchases.mockResolvedValue([tx("a"), tx("b")]);
    action.mockRejectedValue(new Error("linked to another account"));
    await expect(restorePurchases()).rejects.toThrow("linked to another account");
  });

  it("quiet launch sync does not trigger the store sync prompt and never throws", async () => {
    mockedIap.getAvailablePurchases.mockResolvedValue([tx("a")]);
    action.mockRejectedValue(new Error("nope"));
    await expect(syncCurrentPurchases()).resolves.toBeUndefined();
    expect(mockedIap.restorePurchases).not.toHaveBeenCalled();
  });
});
