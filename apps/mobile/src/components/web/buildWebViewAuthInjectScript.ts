/**
 * Injects Convex Auth JWT from the native shell into WebView localStorage.
 * Refresh tokens stay in native secure storage only.
 */
export function buildWebViewAuthInjectScript(
  convexDeploymentUrl: string,
  jwt: string | null
): string {
  const encodedUrl = JSON.stringify(convexDeploymentUrl);
  const encodedJwt = JSON.stringify(jwt);
  return `
(function () {
  var CONVEX_URL = ${encodedUrl};
  var ns = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "");
  var jwtKey = "__convexAuthJWT_" + ns;
  var refreshKey = "__convexAuthRefreshToken_" + ns;
  var jwt = ${encodedJwt};
  // Memory mirror first — available before localStorage on some Android loads.
  window.__SOLOMIND_SHELL_AUTH__ = { jwt: jwt, deploymentUrl: CONVEX_URL };
  window.dispatchEvent(new CustomEvent("solomindlm-native-auth-sync"));
  var hasStoredJwt = false;
  try {
    if (jwt) {
      localStorage.setItem(jwtKey, jwt);
    } else {
      localStorage.removeItem(jwtKey);
    }
    localStorage.removeItem(refreshKey);
    hasStoredJwt = jwt ? !!localStorage.getItem(jwtKey) : true;
  } catch (e) {
    hasStoredJwt = false;
  }
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "native-auth:inject-ack",
      deploymentUrl: CONVEX_URL,
      jwtKey: jwtKey,
      hasStoredJwt: hasStoredJwt,
      hasMemoryJwt: !!(window.__SOLOMIND_SHELL_AUTH__ && window.__SOLOMIND_SHELL_AUTH__.jwt)
    }));
  }
})();
true;
`;
}

/** Dispatches JWT payload via MessageEvent (more reliable than inject alone on Android). */
export function buildWebViewAuthPostMessageScript(
  convexDeploymentUrl: string,
  jwt: string | null
): string {
  const payload = JSON.stringify({
    type: "native-auth:tokens",
    deploymentUrl: convexDeploymentUrl,
    jwt,
  });
  return `
(function () {
  try {
    var data = ${payload};
    var serialized = JSON.stringify(data);
    window.dispatchEvent(new MessageEvent("message", { data: serialized }));
    document.dispatchEvent(new MessageEvent("message", { data: serialized }));
  } catch (e) {}
})();
true;
`;
}
