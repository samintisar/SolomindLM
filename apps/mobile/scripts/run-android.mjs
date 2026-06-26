/**
 * Runs `expo run:android` with JAVA_HOME / ANDROID_HOME set on Windows when missing.
 * Android Studio's bundled JDK is not added to PATH by default.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { patchRnGradlePlugin } from "./patch-rn-gradle-plugin.mjs";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findExpoCli() {
  const searchRoots = [projectRoot, path.resolve(projectRoot, "../..")];
  for (const root of searchRoots) {
    try {
      return require.resolve("@expo/cli/build/bin/cli", { paths: [root] });
    } catch {
      const legacy = path.join(root, "node_modules", "expo", "bin", "cli");
      if (fs.existsSync(legacy)) return legacy;
    }
  }
  return null;
}

function findNodeExecutable() {
  const nodeName = process.platform === "win32" ? "node.exe" : "node";

  const candidates = [
    process.env.NODE_BINARY,
    path.join(process.env.ProgramFiles ?? "", "nodejs", nodeName),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "nodejs", nodeName),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "nodejs", nodeName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const execBase = path.basename(process.execPath).toLowerCase();
  if (execBase === nodeName || execBase === "node") {
    return process.execPath;
  }

  return null;
}

function cleanStaleCmakeCaches(repoRoot) {
  const nodeModules = path.join(repoRoot, "node_modules");
  if (!fs.existsSync(nodeModules)) return;

  const stack = [nodeModules];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".cxx") {
          fs.rmSync(full, { recursive: true, force: true });
        } else if (entry.name !== ".git") {
          stack.push(full);
        }
      }
    }
  }
}

/** Map repo to S: — only when Bun `.bun` store paths exceed Windows CMake limits. */
function shouldUseSubst(repoRoot) {
  if (process.env.SOLOMINDLM_USE_SUBST === "0") return false;
  if (process.env.SOLOMINDLM_USE_SUBST === "1") return true;
  // SUBST + Gradle canonical paths causes mixed S:/C: roots in RN codegen; skip when hoisted.
  return fs.existsSync(path.join(repoRoot, "node_modules", ".bun"));
}

/** Map repo to S: — short paths are required for Windows CMake (250-char limit). */
function resolveMobileProjectRoot(env) {
  const repoRoot = path.resolve(projectRoot, "../..");
  if (process.platform !== "win32" || !shouldUseSubst(repoRoot)) {
    return projectRoot;
  }

  const substDrive = "S:";
  const substTarget = `${substDrive}\\`;
  const list = spawnSync("subst", [], { encoding: "utf8", shell: true });
  const listing = (list.stdout ?? "").replace(/\r/g, "");

  function getSubstMapping(text) {
    for (const line of text.split("\n")) {
      // substDrive is already "S:" — do not append another colon (would match "S::")
      if (!line.toUpperCase().startsWith(substDrive.toUpperCase())) continue;
      const match = line.match(/=>\s*(.+)$/);
      return match?.[1]?.trim() ?? null;
    }
    return null;
  }

  let mappedPath = getSubstMapping(listing);
  if (mappedPath && path.resolve(mappedPath) !== path.resolve(repoRoot)) {
    spawnSync("subst", [substDrive, "/D"], { shell: true, stdio: "ignore" });
    mappedPath = null;
  }

  if (!mappedPath) {
    spawnSync("subst", [substDrive, repoRoot], { shell: true, stdio: "ignore" });
    const relist = spawnSync("subst", [], { encoding: "utf8", shell: true });
    const refreshed = (relist.stdout ?? "").replace(/\r/g, "");
    mappedPath = getSubstMapping(refreshed);
  }

  if (!mappedPath || path.resolve(mappedPath) !== path.resolve(repoRoot)) {
    console.warn("[run-android] Could not create SUBST drive; continuing with long paths.");
    return projectRoot;
  }

  env.SOLOMINDLM_REPO_ROOT = substTarget;
  env.SOLOMINDLM_REPO_ROOT_REAL = repoRoot.replace(/\\/g, "/");
  env.NODE_PATH = path.join(substTarget, "node_modules");
  return path.join(substTarget, "apps", "mobile");
}

function configureNodeWrapper(env, realNodeExecutable) {
  if (process.platform !== "win32") {
    env.NODE_BINARY = realNodeExecutable;
    return realNodeExecutable;
  }

  const wrapper = path.join(projectRoot, "scripts", "node-for-gradle.mjs");
  env.NODE_BINARY_REAL = realNodeExecutable;
  env.NODE_BINARY = realNodeExecutable;
  // Gradle/React Native invoke `node` from PATH — wrapper rewrites Bun store paths.
  prependPath(env, path.dirname(realNodeExecutable));
  const wrapperCmd = `"${realNodeExecutable}" "${wrapper}"`;
  env.SOLOMINDLM_NODE_WRAPPER = wrapperCmd;
  // Prefer wrapper when scripts call `node` (settings.gradle, autolinking).
  const shimDir = path.join(projectRoot, "scripts", ".node-shim");
  fs.mkdirSync(shimDir, { recursive: true });
  const shimPath = path.join(shimDir, "node.cmd");
  fs.writeFileSync(
    shimPath,
    `@echo off\r\n"${realNodeExecutable}" "${wrapper}" %*\r\n`,
    "utf8",
  );
  prependPath(env, shimDir);
  return realNodeExecutable;
}

function configureGradleTempDirs(env, mobileRoot) {
  const gradleDir = path.join(mobileRoot, "android", ".gradle");
  const javaTmp = path.join(gradleDir, "java-tmp");
  const sqliteTmp = path.join(gradleDir, "sqlite-tmp");
  fs.mkdirSync(javaTmp, { recursive: true });
  fs.mkdirSync(sqliteTmp, { recursive: true });

  env.TMP = javaTmp;
  env.TEMP = javaTmp;

  const gradleProps = path.join(mobileRoot, "android", "gradle.properties");
  if (fs.existsSync(gradleProps)) {
    let props = fs.readFileSync(gradleProps, "utf8");
    const sqliteLine = `systemProp.org.sqlite.tmpdir=${sqliteTmp.replace(/\\/g, "/")}`;
    if (!props.includes("systemProp.org.sqlite.tmpdir")) {
      props += `\n${sqliteLine}\n`;
      fs.writeFileSync(gradleProps, props, "utf8");
    }
  }

  const toSlash = (p) => p.replace(/\\/g, "/");
  const jvmOpts = [
    `-Djava.io.tmpdir=${toSlash(javaTmp)}`,
    `-Dorg.sqlite.tmpdir=${toSlash(sqliteTmp)}`,
  ];
  env.GRADLE_OPTS = env.GRADLE_OPTS ? `${env.GRADLE_OPTS} ${jvmOpts.join(" ")}` : jvmOpts.join(" ");
}

function prependPath(env, segment) {
  if (!segment) return;
  const sep = path.delimiter;
  env.PATH = `${segment}${sep}${env.PATH ?? ""}`;
}

function findJdkHome() {
  const fromEnv = process.env.JAVA_HOME;
  if (fromEnv && fs.existsSync(path.join(fromEnv, "bin", process.platform === "win32" ? "java.exe" : "java"))) {
    return fromEnv;
  }

  if (process.platform !== "win32") return null;

  const localAppData = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    "C:\\Program Files\\Android\\Android Studio1\\jbr",
    path.join(localAppData, "Programs", "Android Studio", "jbr"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "bin", "java.exe"))) {
      return candidate;
    }
  }
  return null;
}

function defaultAndroidHome() {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  const sdk = path.join(local, "Android", "Sdk");
  return fs.existsSync(sdk) ? sdk : null;
}

const env = { ...process.env };

const nodeExecutable = findNodeExecutable();
if (!nodeExecutable) {
  console.error(
    "[run-android] Node.js was not found. Gradle needs `node` on PATH.\n" +
      "Install Node.js (https://nodejs.org) or ensure it is on PATH, then retry.",
  );
  process.exit(1);
}
env.NODE_BINARY = nodeExecutable;
configureNodeWrapper(env, nodeExecutable);

const jdk = findJdkHome();
if (jdk) {
  env.JAVA_HOME = jdk;
  prependPath(env, path.join(jdk, "bin"));
} else if (!env.JAVA_HOME) {
  console.error(
    "[run-android] JAVA_HOME is not set and Android Studio JDK was not found.\n" +
      "Install Android Studio or set JAVA_HOME to its jbr folder, e.g.:\n" +
      '  C:\\Program Files\\Android\\Android Studio\\jbr',
  );
  process.exit(1);
}

const androidHome = defaultAndroidHome();
if (androidHome) {
  env.ANDROID_HOME = androidHome;
  prependPath(env, path.join(androidHome, "platform-tools"));
}

if (!patchRnGradlePlugin()) {
  console.error(
    "[run-android] Failed to patch @react-native/gradle-plugin for Gradle 9.\n" +
      "Run: node ./scripts/patch-rn-gradle-plugin.mjs from apps/mobile",
  );
  process.exit(1);
}

const repoRoot = path.resolve(projectRoot, "../..");
cleanStaleCmakeCaches(repoRoot);
const mobileRoot = resolveMobileProjectRoot(env);
configureGradleTempDirs(env, mobileRoot);

// Gradle daemon may cache a bad PATH from an earlier failed attempt.
const gradlew = path.join(mobileRoot, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
if (fs.existsSync(gradlew)) {
  spawnSync(gradlew, ["--stop"], { env, cwd: path.join(mobileRoot, "android"), stdio: "ignore", shell: process.platform === "win32" });
}

const expoCli = findExpoCli();
if (!expoCli) {
  console.error("[run-android] Could not find @expo/cli. Run `bun install` from the repo root.");
  process.exit(1);
}

const expoArgs = ["run:android", ...process.argv.slice(2)];
const result = spawnSync(process.execPath, [expoCli, ...expoArgs], {
  stdio: "inherit",
  env,
  cwd: mobileRoot,
});

process.exit(result.status ?? 1);
