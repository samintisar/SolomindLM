import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * A callback whose identity never changes but which always calls the latest `fn`.
 * For event handlers passed to memoized children (e.g. message bubbles) whose source
 * callback is rebuilt often, such as on every streamed token. Not for use during render.
 * The ref updates in an insertion effect, so layout effects already see the latest `fn`.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R) {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
