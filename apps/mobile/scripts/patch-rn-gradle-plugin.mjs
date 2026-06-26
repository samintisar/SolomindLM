/**
 * React Native 0.83 ships foojay-resolver-convention 0.5.0, which crashes on Gradle 9
 * (JvmVendorSpec.IBM_SEMERU was removed). Bump to 1.0.0 before any Android Gradle build.
 * @see https://github.com/facebook/react-native/issues/56287
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const FOOJAY_OLD = /id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)\.version\("0\.5\.0"\)/;
const FOOJAY_NEW =
  'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")';

function resolveGradlePluginRoot() {
  const searchRoots = [projectRoot, path.resolve(projectRoot, "../..")];
  for (const root of searchRoots) {
    try {
      const reactNativePkg = require.resolve("react-native/package.json", { paths: [root] });
      return path.dirname(
        require.resolve("@react-native/gradle-plugin/package.json", {
          paths: [path.dirname(reactNativePkg)],
        }),
      );
    } catch {
      // try next root
    }
  }
  return null;
}

export function patchRnGradlePlugin() {
  const pluginRoot = resolveGradlePluginRoot();
  if (!pluginRoot) {
    console.warn("[patch-rn-gradle-plugin] @react-native/gradle-plugin not found; skipping.");
    return false;
  }

  const settingsFile = path.join(pluginRoot, "settings.gradle.kts");
  if (!fs.existsSync(settingsFile)) {
    console.warn(`[patch-rn-gradle-plugin] Missing ${settingsFile}; skipping.`);
    return false;
  }

  const content = fs.readFileSync(settingsFile, "utf8");
  if (content.includes('foojay-resolver-convention").version("1.0.0")')) {
    return true;
  }

  if (!FOOJAY_OLD.test(content)) {
    console.warn(
      "[patch-rn-gradle-plugin] Unexpected settings.gradle.kts; foojay 0.5.0 not found.",
    );
    return false;
  }

  fs.writeFileSync(settingsFile, content.replace(FOOJAY_OLD, FOOJAY_NEW));
  console.log("[patch-rn-gradle-plugin] Updated foojay-resolver-convention 0.5.0 → 1.0.0");
  return true;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ok = patchRnGradlePlugin();
  process.exit(ok ? 0 : 1);
}
