export type NativeAuthResponsePayload = {
  type: "native-auth:response";
  requestId: string;
  success: boolean;
  error?: string;
  authenticated?: boolean;
};

/** Delivers an auth response to the WebView page (more reliable than ref.postMessage on Android). */
export function buildNativeAuthResponseInjectScript(payload: NativeAuthResponsePayload): string {
  const encoded = JSON.stringify(payload);
  return `
(function () {
  try {
    var detail = ${encoded};
    window.dispatchEvent(
      new CustomEvent("solomindlm-native-auth-response", { detail: detail })
    );
  } catch (e) {}
})();
true;
`;
}
