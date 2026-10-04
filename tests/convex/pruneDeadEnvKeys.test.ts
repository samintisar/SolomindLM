import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

  it("keeps live keys in an env file it prunes, including ones a dead pattern matches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-env-"));
    const file = path.join(dir, ".env.local");
    const fileLive = new Set(live).add("CHAT_RERANK_TOP_N");
    fs.writeFileSync(
      file,
      "# keys\nOPENAI_API_KEY=sk-test\nCHAT_RERANK_TOP_N=5\nZHIPU_API_KEY=old\nCHAT_MAX_RESULTS=7\n"
    );

    expect(pruneFile(file, fileLive)).toBe(2);
    expect(fs.readFileSync(file, "utf8")).toBe(
      "# keys\nOPENAI_API_KEY=sk-test\nCHAT_RERANK_TOP_N=5\n"
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not prune anything when the script is imported rather than run", () => {
    // Copy the script into a throwaway project root so its default targets point there.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prune-import-"));
    fs.mkdirSync(path.join(root, "scripts"));
    fs.mkdirSync(path.join(root, "convex"));
    const script = path.join(root, "scripts", "prune-dead-env-keys.mjs");
    fs.copyFileSync(path.resolve(__dirname, "../../scripts/prune-dead-env-keys.mjs"), script);
    const env = "ZHIPU_API_KEY=old\nCHAT_MAX_RESULTS=7\n";
    fs.writeFileSync(path.join(root, ".env.local"), env);

    execFileSync(
      "node",
      ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(script).href)})`],
      { cwd: root }
    );

    expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe(env);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
