/**
 * I/O for eval cost: live Together prices and the local run history the estimates read.
 */

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { CostHistoryRecord, ModelRates, TokenRates } from "./cost";

/**
 * Rates as of 2026-10-18, used only when the live price list cannot be fetched. Keep in sync with
 * https://api.together.xyz/v1/models when the models change.
 */
const FALLBACK_RATES: Record<string, TokenRates> = {
  "deepseek-ai/DeepSeek-V4.1-Flash": { input: 0.3, output: 1.2, cachedInput: 0.006 },
  "Qwen/Qwen3.5-9B": { input: 0.17, output: 0.25 },
};

export interface RatesResult {
  rates: ModelRates;
  source: "live" | "fallback";
}

interface TogetherModel {
  id: string;
  pricing?: { input?: number; output?: number; cached_input?: number };
}

/** Current per-model prices from Together's model list, or the built-in table if that fails. */
export async function fetchModelRates(apiKey: string | undefined): Promise<RatesResult> {
  const fallback: RatesResult = {
    rates: new Map(Object.entries(FALLBACK_RATES)),
    source: "fallback",
  };
  if (!apiKey) return fallback;
  try {
    const response = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return fallback;
    const models = (await response.json()) as TogetherModel[];
    const rates: ModelRates = new Map();
    for (const model of models) {
      const { input, output, cached_input } = model.pricing ?? {};
      // Zero-priced entries are dedicated-endpoint variants, not serverless prices.
      if (!input && !output) continue;
      rates.set(model.id, {
        input: input ?? 0,
        output: output ?? 0,
        ...(cached_input ? { cachedInput: cached_input } : {}),
      });
    }
    return rates.size > 0 ? { rates, source: "live" } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * History lives in the main checkout's gitignored `evals/rag/generated/`, so every worktree of the
 * repo reads and adds to the same file. `EVAL_COST_HISTORY` overrides the path.
 */
export function costHistoryPath(): string {
  const override = process.env.EVAL_COST_HISTORY?.trim();
  if (override) return resolve(override);
  let root = process.cwd();
  try {
    const commonDir = execSync("git rev-parse --path-format=absolute --git-common-dir", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (commonDir) root = dirname(commonDir);
  } catch {
    // Not a git checkout: keep the history next to this one.
  }
  return join(root, "evals", "rag", "generated", "cost-history.jsonl");
}

export function readCostHistory(path: string): CostHistoryRecord[] {
  if (!existsSync(path)) return [];
  const records: CostHistoryRecord[] = [];
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as CostHistoryRecord);
    } catch {
      // A torn line from an interrupted write; skip it.
    }
  }
  return records;
}

export function appendCostHistory(path: string, records: CostHistoryRecord[]): void {
  if (records.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, records.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

/** Asks on the terminal; anything but y/yes declines. */
export async function confirmOnTerminal(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
