import { type RefObject, useCallback, useEffect, useRef } from "react";

/** Public site key ("SolomindLM free tools" widget, invisible mode). Not a secret. */
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAAFQDDSV1WRFKhINF";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 30_000;

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/**
 * Loads api.js once. A failed or stalled load (no load/error event within the timeout) drops the
 * cached promise and the tag, so the next call starts a fresh load instead of reusing a dead one.
 */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    const fail = (message: string) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      scriptPromise = null;
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("turnstile_load_timeout"), TOKEN_TIMEOUT_MS);
    script.onload = () => {
      if (!window.turnstile) return fail("turnstile_missing");
      clearTimeout(timer);
      resolve(window.turnstile);
    };
    script.onerror = () => fail("turnstile_load_failed");
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Pending = { resolve: (token: string) => void; reject: (error: Error) => void };

/** Rejects with `message` after `ms`; a stalled challenge must not hang the caller. */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invisible Turnstile: the script loads on first use, and `getToken()` runs a fresh challenge
 * each call (tokens are single-use). The container stays empty unless Cloudflare needs interaction.
 */
export function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
  const widgetId = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(
    () => () => {
      pending.current?.reject(new Error("turnstile_unmounted"));
      pending.current = null;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    },
    []
  );

  const getToken = useCallback(async (): Promise<string> => {
    const turnstile = await loadTurnstile();
    const container = containerRef.current;
    if (!container) throw new Error("turnstile_no_container");

    // A newer call supersedes an older one still waiting on the same widget.
    pending.current?.reject(new Error("turnstile_superseded"));
    const entry = {} as Pending;
    const token = new Promise<string>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    pending.current = entry;

    if (widgetId.current === null) {
      widgetId.current = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (value: string) => pending.current?.resolve(value),
        "error-callback": (code: string) => pending.current?.reject(new Error(`turnstile_${code}`)),
        "expired-callback": () => pending.current?.reject(new Error("turnstile_expired")),
      });
    } else {
      turnstile.reset(widgetId.current);
    }
    turnstile.execute(widgetId.current);

    try {
      return await withTimeout(token, TOKEN_TIMEOUT_MS, "turnstile_timeout");
    } finally {
      if (pending.current === entry) pending.current = null;
    }
  }, [containerRef]);

  return { getToken };
}
