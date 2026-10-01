// Test-only helper. The second dot in the file name makes the Convex bundler skip it,
// so it is never deployed as a function module.
import { beforeAll } from "vitest";

type ModuleLoaders = Record<string, () => Promise<unknown>>;

/**
 * Upper bound for the cold import. It takes ~0.1–1s on an idle machine, but past 10s
 * while several vitest runs shared the machine, so the default 10s hookTimeout is
 * not enough. This still fails a genuinely hung import.
 */
const PRELOAD_TIMEOUT_MS = 60_000;

export async function loadModules(modules: ModuleLoaders, paths: readonly string[]): Promise<void> {
  await Promise.all(
    paths.map((path) => {
      const load = modules[path];
      if (!load) {
        throw new Error(`preloadModules: "${path}" is not in the modules map`);
      }
      return load();
    })
  );
}

/**
 * Imports the given Convex modules in a `beforeAll`, before any test in the file runs.
 *
 * convex-test imports a function's module lazily, on the first call into it, so without
 * this the first test to reach a module pays its whole cold import (auth, SDKs, LangChain,
 * ...) inside that test's 5s timeout, and times out on a busy machine. List every module
 * the file's tests reach, including ones reached indirectly through `ctx.run*` calls.
 */
export function preloadModules(modules: ModuleLoaders, paths: readonly string[]): void {
  beforeAll(() => loadModules(modules, paths), PRELOAD_TIMEOUT_MS);
}
