jest.mock("./iapService", () => ({
  loadProducts: jest.fn(),
  purchase: jest.fn(),
  restorePurchases: jest.fn(),
  openSubscriptionManagement: jest.fn(),
}));

import { handleIapRequest } from "./handleIapRequest";
import * as service from "./iapService";

const mocked = service as jest.Mocked<typeof service>;

describe("handleIapRequest", () => {
  it("answers products", async () => {
    mocked.loadProducts.mockResolvedValue([
      { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2", price: 2, period: "month" },
    ]);
    await expect(
      handleIapRequest({ kind: "iap", requestId: "r", action: "products" })
    ).resolves.toEqual({
      requestId: "r",
      ok: true,
      result: {
        products: [
          { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2", price: 2, period: "month" },
        ],
      },
    });
  });

  it("answers a purchase with its outcome", async () => {
    mocked.purchase.mockResolvedValue({ status: "cancelled" });
    await expect(
      handleIapRequest({ kind: "iap", requestId: "r", action: "purchase", productId: "p" })
    ).resolves.toEqual({ requestId: "r", ok: true, result: { status: "cancelled" } });
    expect(mocked.purchase).toHaveBeenCalledWith("p");
  });

  it("turns thrown errors into error responses", async () => {
    mocked.restorePurchases.mockRejectedValue(new Error("linked to another SolomindLM account"));
    await expect(
      handleIapRequest({ kind: "iap", requestId: "r", action: "restore" })
    ).resolves.toEqual({
      requestId: "r",
      ok: false,
      error: "linked to another SolomindLM account",
    });
  });
});
