// Shared helpers: open the signed-in profile as the iOS shell would render the web app.
const { chromium } = require("playwright-core");
const path = require("path");

const BASE = "https://www.solomindlm.com";

// Web content area = device screen minus the top safe area (the native SafeAreaView paints it).
const DEVICES = {
  // iPhone 6.1"/6.3" with Dynamic Island: 1179 x 2556 (393 x 852 pt @3x), 59 pt status bar.
  iphone: {
    screen: { width: 393, height: 852 },
    statusBar: 59,
    scale: 3,
    mobile: true,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  },
  // iPad 13": 2064 x 2752 (1032 x 1376 pt @2x), 24 pt status bar.
  ipad: {
    screen: { width: 1032, height: 1376 },
    statusBar: 24,
    scale: 2,
    mobile: true,
    ua: "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  },
  // iPhone Duo unfolded: 2007 x 2853 (669 x 951 pt @3x), 44 pt status bar. Under 768 pt the
  // web app keeps its tabbed phone layout.
  duo: {
    screen: { width: 669, height: 951 },
    statusBar: 44,
    scale: 3,
    mobile: true,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  },
  // iPhone Duo unfolded, landscape: 2853 x 2007 (951 x 669 pt @3x). Over 768 pt the web app
  // shows the multi-panel layout, like the iPad.
  duol: {
    screen: { width: 951, height: 669 },
    statusBar: 24,
    scale: 3,
    mobile: true,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  },
  // iPad 13" landscape: 2752 x 2064 (1376 x 1032 pt @2x), 24 pt status bar.
  ipadl: {
    screen: { width: 1376, height: 1032 },
    statusBar: 24,
    scale: 2,
    mobile: true,
    ua: "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  },
};

async function openShell(deviceName, { headless = true, shell = true } = {}) {
  const d = DEVICES[deviceName];
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, "profile"), {
    headless,
    viewport: { width: d.screen.width, height: d.screen.height - d.statusBar },
    deviceScaleFactor: d.scale,
    isMobile: d.mobile,
    hasTouch: true,
    userAgent: d.ua,
    colorScheme: "light",
  });
  if (shell) {
    await ctx.addInitScript(() => {
      window.__IS_NATIVE_SHELL__ = true;
      window.ReactNativeWebView = { postMessage: () => {} };
    });
  }
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page, device: d };
}

module.exports = { BASE, DEVICES, openShell };
