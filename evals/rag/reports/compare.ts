/**
 * Pairwise comparison of two eval artifact sets using an LLM judge with position-bias swap.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { getFixture } from "../fixtures";
import { createTogetherJudgeInvoker, DEFAULT_JUDGE_MODEL } from "../metrics/togetherLlmJudge";
import type {
  CompareCaseResult,
  CompareReport,
  ConcreteRunnerKind,
  EvalRunArtifact,
} from "../types";

export interface CompareArtifactsOptions {
  pathA: string;
  pathB: string;
  judgeModel?: string;
  commitSha?: string;
}

export function artifactFileName(artifact: EvalRunArtifact): string {
  return `${artifact.caseId}__${artifact.runner}.json`;
}

/** Write per-case JSON files that `loadArtifactsFromDir` / `--compare` can read. */
export function exportEvalRunArtifacts(dir: string, artifacts: EvalRunArtifact[]): void {
  mkdirSync(dir, { recursive: true });
  for (const artifact of artifacts) {
    writeFileSync(join(dir, artifactFileName(artifact)), `${JSON.stringify(artifact, null, 2)}\n`);
  }
}

export function loadArtifactsFromDir(dir: string): EvalRunArtifact[] {
  const artifacts: EvalRunArtifact[] = [];
  const entries = readdirSync(dir);
  for (const name of entries) {
    const full = join(dir, name);
    if (!name.endsWith(".json") || !statSync(full).isFile()) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(full, "utf-8"));
      if (raw && typeof raw.caseId === "string" && typeof raw.runner === "string") {
        artifacts.push(raw as EvalRunArtifact);
      }
    } catch {
      // skip invalid files
    }
  }
  return artifacts;
}

function comparePrompt(question: string, answerA: string, answerB: string): string {
  return `You are comparing two AI outputs for the same task. Pick the better answer.

Question: ${question}

Answer A:
${answerA.slice(0, 6000)}

Answer B:
${answerB.slice(0, 6000)}

Respond JSON only: {"winner": "A" | "B" | "tie", "reason": string}`;
}

function parseWinner(raw: string): { winner: "A" | "B" | "tie"; reason: string } {
  const jsonMatch = raw.trim().match(/\{[\s\S]*\}/);
  const payload = jsonMatch ? jsonMatch[0] : raw.trim();
  const parsed = JSON.parse(payload) as { winner?: string; reason?: string };
  const w = parsed.winner?.toUpperCase();
  const winner = w === "A" || w === "B" || w === "TIE" ? (w as "A" | "B" | "TIE") : "tie";
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "No reason";
  return { winner, reason };
}

async function judgePair(
  invoke: (prompt: string) => Promise<string>,
  question: string,
  answerA: string,
  answerB: string
): Promise<"a" | "b" | "tie"> {
  const forward = parseWinner(await invoke(comparePrompt(question, answerA, answerB)));
  const backward = parseWinner(await invoke(comparePrompt(question, answerB, answerA)));

  const forwardB = forward.winner === "A" ? "a" : forward.winner === "B" ? "b" : "tie";
  const backwardB = backward.winner === "A" ? "b" : backward.winner === "B" ? "a" : "tie";

  if (forwardB === backwardB) {
    return forwardB;
  }
  return "tie";
}

/**
 * Compare overlapping cases between two artifact directories.
 */
export async function compareArtifactDirs(
  options: CompareArtifactsOptions
): Promise<CompareReport> {
  const judgeModel = options.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const invoke = createTogetherJudgeInvoker({ model: judgeModel });

  const artifactsA = loadArtifactsFromDir(options.pathA);
  const artifactsB = loadArtifactsFromDir(options.pathB);

  const mapA = new Map<string, EvalRunArtifact>();
  const mapB = new Map<string, EvalRunArtifact>();
  for (const a of artifactsA) {
    mapA.set(`${a.caseId}::${a.runner}`, a);
  }
  for (const b of artifactsB) {
    mapB.set(`${b.caseId}::${b.runner}`, b);
  }

  const cases: CompareCaseResult[] = [];
  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  const byRunner: CompareReport["byRunner"] = {};

  for (const [key, artA] of mapA) {
    const artB = mapB.get(key);
    if (!artB) continue;

    const question = (() => {
      try {
        return getFixture(artA.caseId).question;
      } catch {
        return artA.caseId;
      }
    })();
    const winner = await judgePair(invoke, question, artA.answer, artB.answer);
    const caseResult: CompareCaseResult = {
      caseId: artA.caseId,
      runner: artA.runner as ConcreteRunnerKind,
      winner,
      reason: `Position-bias swap: ${winner}`,
    };
    cases.push(caseResult);

    if (winner === "a") winsA++;
    else if (winner === "b") winsB++;
    else ties++;

    const r = artA.runner;
    if (!byRunner[r]) {
      byRunner[r] = { winsA: 0, winsB: 0, ties: 0, winRateB: 0 };
    }
    if (winner === "a") byRunner[r].winsA++;
    else if (winner === "b") byRunner[r].winsB++;
    else byRunner[r].ties++;
  }

  for (const stats of Object.values(byRunner)) {
    const total = stats.winsA + stats.winsB + stats.ties;
    stats.winRateB = total > 0 ? (stats.winsB + stats.ties / 2) / total : 0;
  }

  const total = winsA + winsB + ties;
  const winRateB = total > 0 ? (winsB + ties / 2) / total : 0;

  return {
    timestamp: new Date().toISOString(),
    commitSha: options.commitSha ?? "unknown",
    judgeModel,
    pathA: options.pathA,
    pathB: options.pathB,
    casesCompared: cases.length,
    winsA,
    winsB,
    ties,
    winRateB,
    byRunner,
    cases,
  };
}
