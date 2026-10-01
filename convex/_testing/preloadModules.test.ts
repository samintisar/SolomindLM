import { describe, expect, test, vi } from "vitest";
import { loadModules } from "./preloadModules.helpers";

describe("loadModules", () => {
  test("imports every requested module", async () => {
    const billing = vi.fn(async () => ({}));
    const notebooks = vi.fn(async () => ({}));
    const unrelated = vi.fn(async () => ({}));

    await loadModules(
      { "./billing/index.ts": billing, "./notebooks/index.ts": notebooks, "./auth.ts": unrelated },
      ["./billing/index.ts", "./notebooks/index.ts"]
    );

    expect(billing).toHaveBeenCalledOnce();
    expect(notebooks).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
  });

  test("rejects a path missing from the modules map instead of silently skipping it", async () => {
    await expect(
      loadModules({ "./billing/index.ts": async () => ({}) }, ["./billing/idnex.ts"])
    ).rejects.toThrow('"./billing/idnex.ts" is not in the modules map');
  });

  test("propagates an import failure", async () => {
    await expect(
      loadModules(
        {
          "./broken.ts": async () => {
            throw new Error("boom");
          },
        },
        ["./broken.ts"]
      )
    ).rejects.toThrow("boom");
  });
});
