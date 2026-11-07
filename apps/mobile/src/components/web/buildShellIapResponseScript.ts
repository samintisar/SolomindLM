export type ShellIapResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string };

/** Delivers an IAP response to the page (same channel as the auth bridge's responses). */
export function buildShellIapResponseScript(payload: ShellIapResponse): string {
  // Escape "<" and line separators so the JSON can't break out of the injected script.
  const encoded = JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `
(function () {
  try {
    window.dispatchEvent(
      new CustomEvent("solomindlm-shell-iap-response", { detail: ${encoded} })
    );
  } catch (e) {}
})();
true;
`;
}
