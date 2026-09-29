/**
 * Sync use-case pack sources into the eval owner's notebooks (Test folder).
 *
 * Usage:
 *   bun run eval:seed                          # every registered pack
 *   bun run eval:seed -- --use-case language-learners,medical-students
 *
 * Needs RAG_EVAL_CONVEX_URL + RAG_EVAL_SECRET locally, and on the deployment:
 * RAG_EVALS_ENABLED=true, RAG_EVAL_SECRET, RAG_EVAL_OWNER_EMAIL.
 */
import { getPack, USE_CASE_PACKS } from "./usecases";
import { createConvexSeedApi } from "./usecases/convexSeedApi";
import { assertNotProdConvexUrl } from "./usecases/prodGuard";
import { seedPack } from "./usecases/seedClient";
import { readPackSources } from "./usecases/sources";
import type { RegisteredPack } from "./usecases/types";
import { validatePack } from "./usecases/validate";

function selectedPackIds(args: string[]): string[] {
  const index = args.indexOf("--use-case");
  if (index === -1) return USE_CASE_PACKS.map((p) => p.pack.id);
  const value = args[index + 1] ?? "";
  if (value === "all") return USE_CASE_PACKS.map((p) => p.pack.id);
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const convexUrl = process.env.RAG_EVAL_CONVEX_URL?.trim();
  const evalSecret = process.env.RAG_EVAL_SECRET?.trim();
  if (!convexUrl || !evalSecret) {
    fatal("set RAG_EVAL_CONVEX_URL and RAG_EVAL_SECRET (see evals/rag/env.eval.example).");
  }
  try {
    assertNotProdConvexUrl(convexUrl, process.env.CONVEX_DEPLOYMENT);
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err));
  }

  // Resolve every requested pack up front so a typo fails before anything is seeded.
  const packIds = selectedPackIds(process.argv.slice(2));
  const packs: RegisteredPack[] = [];
  try {
    for (const id of packIds) packs.push(getPack(id));
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err));
  }
  if (packs.length === 0) {
    console.log("No use-case packs registered (evals/rag/usecases/index.ts). Nothing to seed.");
    return;
  }

  const api = createConvexSeedApi(convexUrl, evalSecret);
  let failures = 0;
  for (const registered of packs) {
    const { pack } = registered;
    console.log(`[${pack.id}] → "${pack.notebookTitle}"`);
    const problems = validatePack(registered);
    if (problems.length > 0) {
      failures++;
      console.error("  INVALID PACK:");
      for (const problem of problems) console.error(`    - ${problem}`);
      continue;
    }
    try {
      const result = await seedPack(pack, readPackSources(registered), api, {
        log: (line) => console.log(line),
      });
      const changed = result.actions.filter((a) => a.kind !== "skip").length;
      console.log(
        `  ready: notebook ${result.notebookId}, ${result.documentIds.length} doc(s), ` +
          `${result.totalChunks} chunk(s), ${changed} changed`
      );
    } catch (err) {
      failures++;
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
