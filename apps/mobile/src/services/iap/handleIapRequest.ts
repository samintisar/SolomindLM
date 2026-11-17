import type { ShellIapResponse } from "@mobile/components/web/buildShellIapResponseScript";
import type { IapRequest } from "@mobile/components/web/parseShellWebMessage";
import { errorMessage } from "./iapMappers";
import { loadProducts, openSubscriptionManagement, purchase, restorePurchases } from "./iapService";

/** Run one web request and build the response the page is waiting for. Never throws. */
export async function handleIapRequest(request: IapRequest): Promise<ShellIapResponse> {
  const { requestId } = request;
  try {
    switch (request.action) {
      case "products":
        return { requestId, ok: true, result: { products: await loadProducts() } };
      case "purchase":
        return { requestId, ok: true, result: await purchase(request.productId) };
      case "restore":
        return { requestId, ok: true, result: { restored: await restorePurchases() } };
      case "manage":
        await openSubscriptionManagement();
        return { requestId, ok: true, result: null };
    }
  } catch (error) {
    return { requestId, ok: false, error: errorMessage(error) };
  }
}
