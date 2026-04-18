// SDK 55+ — map @convex/* to the repo root `convex/` folder (matches tsconfig paths).
// Metro does not read TypeScript path aliases; without this, imports like
// `@convex/_generated/api` fail to resolve.
const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");
const { resolve: metroResolve } = require("metro-resolver");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const convexRoot = path.join(monorepoRoot, "convex");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@convex/")) {
    const subpath = moduleName.slice("@convex/".length);
    const basePath = path.join(convexRoot, subpath);
    const tryExtensions = [".js", ".jsx", ".ts", ".tsx", ".json"];
    for (const ext of tryExtensions) {
      const candidate = basePath + ext;
      if (fs.existsSync(candidate)) {
        return { filePath: candidate, type: "sourceFile" };
      }
    }
    for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
      const candidate = path.join(basePath, "index" + ext);
      if (fs.existsSync(candidate)) {
        return { filePath: candidate, type: "sourceFile" };
      }
    }
  }
  if (typeof defaultResolveRequest === "function") {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return metroResolve(context, moduleName, platform);
};

module.exports = config;
