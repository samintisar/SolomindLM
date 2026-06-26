const appJson = require("./app.json");

/** Cleartext HTTP is required for LAN Vite dev; disable on EAS production builds. */
const usesCleartextTraffic = process.env.EAS_BUILD_PROFILE !== "production";

function patchPlugins(plugins) {
  return plugins.map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "expo-build-properties") {
      return [
        "expo-build-properties",
        {
          ...plugin[1],
          android: {
            ...plugin[1]?.android,
            usesCleartextTraffic,
          },
        },
      ];
    }
    return plugin;
  });
}

/** @type {import("expo/config").ExpoConfig} */
module.exports = () => ({
  ...appJson.expo,
  plugins: patchPlugins(appJson.expo.plugins),
});
