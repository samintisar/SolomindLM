import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs script without type declarations
import { findLiveKeys, pruneFile, shouldRemove } from "../../scripts/prune-dead-env-keys.mjs";

describe("prune-dead-env-keys", () => {
  const live: Set<string> = findLiveKeys();

  it("finds keys the Convex code reads from process.env", () => {
    expect(live.has("OPENAI_API_KEY")).toBe(true);
    expect(live.has("VOYAGE_API_KEY")).toBe(true);
  });

  it("never prunes a key Convex reads, even if it is listed as dead", () => {
    expect(shouldRemove("OPENAI_API_KEY", live)).toBe(false);
    expect(shouldRemove("CHAT_RERANK_TOP_N", new Set(["CHAT_RERANK_TOP_N"]))).toBe(false);
  });

  it("still prunes legacy keys and hardcoded agent settings", () => {
    expect(shouldRemove("ZHIPU_API_KEY", live)).toBe(true);
    expect(shouldRemove("CHAT_RERANK_TOP_N", live)).toBe(true);
    expect(shouldRemove("REPORT_MAP_MAX_TOKENS", live)).toBe(true);
    expect(shouldRemove("TAVILY_API_KEY", live)).toBe(false);
  });

  it("keeps OPENAI_API_KEY in an env file it prunes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-env-"));
    const file = path.join(dir, ".env.local");
    fs.writeFileSync(
      file,
      "# keys\nOPENAI_API_KEY=sk-test\nZHIPU_API_KEY=old\nCHAT_MAX_RESULTS=7\n"
    );

    expect(pruneFile(file, live)).toBe(2);
    expect(fs.readFileSync(file, "utf8")).toBe("# keys\nOPENAI_API_KEY=sk-test\n");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
