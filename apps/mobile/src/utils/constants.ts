/**
 * `react-native-webview`: npm latest is still 13.x; Expo SDK 55 + New Architecture uses this line.
 * When a 14.x release ships with explicit NA support, bump the dependency in package.json.
 */

/** Runs before the web app loads: marks the shell and what this build can do. */
export function buildNativeShellInject(capabilities: { iap: boolean }): string {
  return `
(function () {
  try {
    window.__IS_NATIVE_SHELL__ = true;
    window.__SHELL_CAPABILITIES__ = ${JSON.stringify(capabilities)};
  } catch (e) {}
})();
true;
`;
}
