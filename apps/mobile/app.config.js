const fs = require("fs");
const path = require("path");

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
module.exports = () => {
  // Read fresh on every call instead of `require`, which caches for the
  // life of the process: `eas build` writes interactive-prompt answers
  // (EAS project ID, encryption-export compliance, ...) to app.json on
  // disk and immediately re-reads the resolved config in the same run.
  // A `require`d copy stays the pre-write snapshot, so the re-read saw
  // fields as `undefined` and crashed right after each prompt.
  const appJsonPath = path.join(__dirname, "app.json");
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

  return {
    ...appJson.expo,
    plugins: patchPlugins(appJson.expo.plugins),
  };
};
