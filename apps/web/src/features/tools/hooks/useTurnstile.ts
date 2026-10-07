import { type RefObject, useCallback, useEffect, useRef } from "react";

/** Public site key ("SolomindLM free tools" widget, invisible mode). Not a secret. */
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAAFQDDSV1WRFKhINF";
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

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing"));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Pending = { resolve: (token: string) => void; reject: (error: Error) => void };

/**
 * Invisible Turnstile: the script loads on first use, and `getToken()` runs a fresh challenge
 * each call (tokens are single-use). The container stays empty unless Cloudflare needs interaction.
 */
export function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
  const widgetId = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(
    () => () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    },
    []
  );

  const getToken = useCallback(async (): Promise<string> => {
    const turnstile = await loadTurnstile();
    const container = containerRef.current;
    if (!container) throw new Error("turnstile_no_container");

    const token = new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
    });

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

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("turnstile_timeout")), TOKEN_TIMEOUT_MS);
    });
    try {
      return await Promise.race([token, timeout]);
    } finally {
      clearTimeout(timer);
      pending.current = null;
    }
  }, [containerRef]);

  return { getToken };
}
