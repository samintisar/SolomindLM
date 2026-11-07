import { useCallback, useEffect, useState } from "react";
import { type IapProduct, loadIapProducts } from "./iapBridge";

type ProductsState =
  | { status: "loading" }
  | { status: "ready"; products: IapProduct[] }
  | { status: "error"; message: string };

/** Loads the App Store plans from the native shell; `retry` reloads after an error. */
export function useIapProducts(): { state: ProductsState; retry: () => void } {
  const [state, setState] = useState<ProductsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadIapProducts().then(
      (products) => {
        if (cancelled) return;
        setState(
          products.length > 0
            ? { status: "ready", products }
            : { status: "error", message: "Plans aren't available right now." }
        );
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Plans aren't available right now.",
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
