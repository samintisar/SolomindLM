// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IapProduct } from "./iapBridge";

const loadIapProducts = vi.fn();
vi.mock("./iapBridge", () => ({ loadIapProducts: () => loadIapProducts() }));

const { useIapProducts } = await import("./useIapProducts");

const PRODUCT: IapProduct = {
  id: "com.solomindlm.app.pro.monthly",
  displayPrice: "$1.99",
  price: 1.99,
  period: "month",
};

describe("useIapProducts", () => {
  beforeEach(() => loadIapProducts.mockReset());

  it("loads products", async () => {
    loadIapProducts.mockResolvedValue([PRODUCT]);
    const { result } = renderHook(() => useIapProducts());
    expect(result.current.state.status).toBe("loading");
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", products: [PRODUCT] })
    );
  });

  it("reports an error, then reloads on retry", async () => {
    loadIapProducts.mockRejectedValueOnce(new Error("Store unavailable"));
    loadIapProducts.mockResolvedValueOnce([PRODUCT]);
    const { result } = renderHook(() => useIapProducts());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", message: "Store unavailable" })
    );
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(loadIapProducts).toHaveBeenCalledTimes(2);
  });

  it("treats an empty list as an error", async () => {
    loadIapProducts.mockResolvedValue([]);
    const { result } = renderHook(() => useIapProducts());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
  });

  it("does not update state after unmount", async () => {
    let resolve: (p: IapProduct[]) => void = () => {};
    loadIapProducts.mockReturnValue(new Promise<IapProduct[]>((r) => (resolve = r)));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useIapProducts());
    unmount();
    await act(async () => resolve([PRODUCT]));
    expect(result.current.state.status).toBe("loading");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
