/**
 * Pairwise comparison of two eval artifact sets using an LLM judge with position-bias swap.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { caseFileStem } from "../caseFile";
import { getFixture } from "../fixtures";
import { combineChunkContents } from "../metrics/binaryJudges";
import { createTogetherJudgeInvoker, DEFAULT_JUDGE_MODEL } from "../metrics/togetherLlmJudge";
import type {
  ChunkSnapshot,
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
  /** Judge invoker; defaults to the Together judge (tests inject a stub) */
  invoke?: (prompt: string) => Promise<string>;
}

function artifactFileName(artifact: EvalRunArtifact): string {
  return `${caseFileStem(artifact.caseId)}__${artifact.runner}.json`;
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

/** Evidence budget for the pairwise judge: both answers' passages, deduplicated. */
const COMPARE_EVIDENCE_LIMIT = 24_000;
const NO_EVIDENCE_NOTE = "(no retrieved passages recorded for these outputs)";

type Verdict = "a" | "b" | "tie";

/**
 * The passages both answers were built from: one copy of each (whitespace-normalised content),
 * formatted like the binary judges' chunks. Chunk ids are local to each answer, so the judge is
 * told to read the passages as evidence, not to look ids up.
 */
export function comparisonEvidence(artA: EvalRunArtifact, artB: EvalRunArtifact): string {
  if (artA.selectedChunks.length === 0 || artB.selectedChunks.length === 0) {
    return NO_EVIDENCE_NOTE;
  }
  const seen = new Set<string>();
  const unique: ChunkSnapshot[] = [];
  for (const chunk of [...artA.selectedChunks, ...artB.selectedChunks]) {
    const key = (chunk.contextText ?? chunk.content).replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }
  return combineChunkContents(unique, COMPARE_EVIDENCE_LIMIT);
}

/** One presentation of the pair: `answerA` is shown in slot A, `answerB` in slot B. */
export function comparePrompt(
  question: string,
  answerA: string,
  answerB: string,
  evidence: string
): string {
  return `You are comparing two AI answers to the same question. Pick the better answer.

Judge in this order:
1. Grounding: which answer's substantive claims are supported by the evidence? A claim the evidence does not support counts against an answer, however fluent it reads.
2. Completeness: which answer covers what the question asks, as far as the evidence allows?
3. Clarity: which answer is easier to follow?

Do not prefer an answer because it is longer. Say "tie" when neither is clearly better.

Question: ${question}

Evidence (passages retrieved for these answers; chunk ids are local to each answer):
${evidence}

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
  const winner = w === "A" || w === "B" ? w : "tie";
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim().replace(/\s+/g, " ")
      : "No reason";
  return { winner, reason };
}

export interface PairJudgement {
  /** Agreed verdict; "tie" when the two orders disagree */
  winner: Verdict;
  /** Verdict with A in slot A, mapped back to artifact A / B */
  forward: Verdict;
  /** Verdict with B in slot A, mapped back to artifact A / B */
  backward: Verdict;
  reasonForward: string;
  reasonBackward: string;
}

/** Judge both position orders and map the verdicts back to artifact A / B. */
export async function judgeArtifactPair(
  invoke: (prompt: string) => Promise<string>,
  question: string,
  artA: EvalRunArtifact,
  artB: EvalRunArtifact
): Promise<PairJudgement> {
  const evidence = comparisonEvidence(artA, artB);
  const forward = parseWinner(
    await invoke(comparePrompt(question, artA.answer, artB.answer, evidence))
  );
  const backward = parseWinner(
    await invoke(comparePrompt(question, artB.answer, artA.answer, evidence))
  );

  const forwardVerdict: Verdict =
    forward.winner === "A" ? "a" : forward.winner === "B" ? "b" : "tie";
  const backwardVerdict: Verdict =
    backward.winner === "A" ? "b" : backward.winner === "B" ? "a" : "tie";
  return {
    winner: forwardVerdict === backwardVerdict ? forwardVerdict : "tie",
    forward: forwardVerdict,
    backward: backwardVerdict,
    reasonForward: forward.reason,
    reasonBackward: backward.reason,
  };
}

function summarise(judgement: PairJudgement): string {
  if (judgement.forward === judgement.backward) {
    return `${judgement.winner} in both orders`;
  }
  return `position disagreement (forward ${judgement.forward}, swapped ${judgement.backward}): tie`;
}

type WinTally = { winsA: number; winsB: number; ties: number; winRateB: number };

/** Win counts per key (cases whose key is undefined are skipped); ties count half. */
export function tallyWins(
  cases: CompareCaseResult[],
  keyOf: (c: CompareCaseResult) => string | undefined
): Record<string, WinTally> {
  const tally: Record<string, WinTally> = {};
  for (const c of cases) {
    const key = keyOf(c);
    if (key === undefined) continue;
    const row = (tally[key] ??= { winsA: 0, winsB: 0, ties: 0, winRateB: 0 });
    if (c.winner === "a") row.winsA++;
    else if (c.winner === "b") row.winsB++;
    else row.ties++;
  }
  for (const row of Object.values(tally)) {
    const total = row.winsA + row.winsB + row.ties;
    row.winRateB = total > 0 ? (row.winsB + row.ties / 2) / total : 0;
  }
  return tally;
}

/**
 * Compare overlapping cases between two artifact directories.
 */
export async function compareArtifactDirs(
  options: CompareArtifactsOptions
): Promise<CompareReport> {
  const judgeModel = options.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const invoke = options.invoke ?? createTogetherJudgeInvoker({ model: judgeModel });

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
    const judgement = await judgeArtifactPair(invoke, question, artA, artB);
    const winner = judgement.winner;
    const caseResult: CompareCaseResult = {
      caseId: artA.caseId,
      runner: artA.runner as ConcreteRunnerKind,
      winner,
      forward: judgement.forward,
      backward: judgement.backward,
      reason: summarise(judgement),
      reasonForward: judgement.reasonForward,
      reasonBackward: judgement.reasonBackward,
      useCase: artA.useCase,
    };
    cases.push(caseResult);

    if (winner === "a") winsA++;
    else if (winner === "b") winsB++;
    else ties++;
  }

  const total = winsA + winsB + ties;
  const winRateB = total > 0 ? (winsB + ties / 2) / total : 0;
  const positionDisagreements = cases.filter((c) => c.forward !== c.backward).length;

  return {
    timestamp: new Date().toISOString(),
    commitSha: options.commitSha ?? "unknown",
    judgeModel,
    pathA: options.pathA,
    pathB: options.pathB,
    casesCompared: cases.length,
    positionDisagreements,
    winsA,
    winsB,
    ties,
    winRateB,
    byRunner: tallyWins(cases, (c) => c.runner),
    byUseCase: tallyWins(cases, (c) => c.useCase),
    cases,
  };
}
