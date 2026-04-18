/**
 * After load, copies Convex Auth tokens from WebView localStorage to the native shell
 * via `postMessage` (see `NativeConvexAuthBridgeProvider`).
 */
export function buildConvexAuthFlushInjectScript(convexDeploymentUrl: string): string {
  const encoded = JSON.stringify(convexDeploymentUrl);
  return `
(function () {
  var CONVEX_URL = ${encoded};
  function keys() {
    var ns = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "");
    return {
      jwt: "__convexAuthJWT_" + ns,
      refresh: "__convexAuthRefreshToken_" + ns,
    };
  }
  function flush() {
    try {
      if (!window.ReactNativeWebView) return;
      var k = keys();
      var jwt = localStorage.getItem(k.jwt);
      var refresh = localStorage.getItem(k.refresh);
      if (jwt && refresh) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "convex-auth-tokens",
            jwt: jwt,
            refresh: refresh,
          })
        );
      }
    } catch (e) {}
  }
  flush();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) flush();
  });
  setInterval(flush, 4000);
})();
true;
`;
}
