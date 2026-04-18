/**
 * `react-native-webview`: npm latest is still 13.x; Expo SDK 55 + New Architecture uses this line.
 * When a 14.x release ships with explicit NA support, bump the dependency in package.json.
 */
export const NATIVE_SHELL_INJECT = `
(function () {
  try {
    window.__IS_NATIVE_SHELL__ = true;
  } catch (e) {}
})();
true;
`;
