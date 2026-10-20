/**
 * Pairwise comparison of two eval artifact sets using an LLM judge with position-bias swap.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { caseFileStem } from "../caseFile";
import { getFixture } from "../fixtures";
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

/** Evidence budget for the pairwise judge: half to each run's passages. */
const COMPARE_EVIDENCE_LIMIT = 24_000;
const NO_EVIDENCE_NOTE = "(no retrieved passages recorded for these outputs)";
const SIDE_SEPARATOR = "\n\n---\n\n";
const CUT_EVIDENCE_NOTE =
  "Some retrieved passages were cut off for judging; do not fail a claim only because its support would be in a passage that is not shown.";

type Verdict = "a" | "b" | "tie";
/** Which artifact a passage came from: run A or run B. */
type Side = "A" | "B";

interface SidePassage {
  label: string;
  key: string;
  text: string;
}

interface SideFill {
  kept: SidePassage[];
  skipped: string[];
  cut: boolean;
}

/** Every passage of one run in order, duplicates included, labelled `[A-3]` etc. */
function sideEntries(side: Side, chunks: ChunkSnapshot[]): SidePassage[] {
  return chunks.map((chunk) => {
    const body = chunk.contextText ?? chunk.content;
    const label = `${side}-${chunk.id}`;
    const title = chunk.sourceTitle ? ` ${chunk.sourceTitle}` : "";
    return { label, key: body.replace(/\s+/g, " ").trim(), text: `[${label}]${title}\n${body}` };
  });
}

interface SidePlacement {
  kept: SidePassage[];
  cut: boolean;
  /** `[B-2] is the same passage as [A-3].` lines: the label's content is shown under another label */
  aliases: string[];
  /** Labels whose content is not shown at all (over budget, and no shown copy) */
  hidden: string[];
}

/**
 * Places one run's passages. The first copy of each passage is shown within `budget`, unless the
 * other run already shows it (then it is an alias). A later copy of a shown passage is an alias
 * too. Anything else is hidden and listed, so every citation label has a target.
 */
function placeSide(
  entries: SidePassage[],
  shownElsewhere: Map<string, string>,
  budget: number
): SidePlacement {
  const seen = new Set<string>();
  const unique: SidePassage[] = [];
  for (const entry of entries) {
    if (seen.has(entry.key) || shownElsewhere.has(entry.key)) continue;
    seen.add(entry.key);
    unique.push(entry);
  }
  const fill = fillSide(unique, budget);
  const shownHere = new Map(fill.kept.map((p) => [p.key, p.label]));
  const aliases: string[] = [];
  const hidden: string[] = [];
  for (const entry of entries) {
    if (shownHere.get(entry.key) === entry.label) continue;
    const target = shownElsewhere.get(entry.key) ?? shownHere.get(entry.key);
    if (target !== undefined) {
      aliases.push(`[${entry.label}] is the same passage as [${target}].`);
    } else {
      hidden.push(entry.label);
    }
  }
  return { kept: fill.kept, cut: fill.cut, aliases, hidden };
}

/**
 * Whole passages in order while they fit `budget`. A first passage longer than the budget is cut
 * and marked; a passage that does not fit is skipped and its label listed.
 */
function fillSide(passages: SidePassage[], budget: number): SideFill {
  const kept: SidePassage[] = [];
  const skipped: string[] = [];
  let used = 0;
  let cut = false;
  for (const passage of passages) {
    if (kept.length === 0 && passage.text.length > budget) {
      cut = true;
      kept.push({ ...passage, text: `${passage.text.slice(0, budget)}\n[… passage cut off here]` });
      used = budget;
      continue;
    }
    const separator = kept.length > 0 ? SIDE_SEPARATOR.length : 0;
    if (used + separator + passage.text.length > budget) {
      skipped.push(passage.label);
      continue;
    }
    kept.push(passage);
    used += separator + passage.text.length;
  }
  return { kept, skipped, cut };
}

/**
 * The passages both runs were built from. Shared by both prompt directions, so the evidence text is
 * identical whichever answer is shown first. Each run gets half the budget (all of it when the
 * other run recorded none), and the runs are interleaved A, B, A, B so one verbose run cannot crowd
 * the other out. A passage both runs used is shown once, under A, with an alias line for B's label.
 */
export function comparisonEvidence(artA: EvalRunArtifact, artB: EvalRunArtifact): string {
  const entriesA = sideEntries("A", artA.selectedChunks);
  const entriesB = sideEntries("B", artB.selectedChunks);
  if (entriesA.length === 0 && entriesB.length === 0) return NO_EVIDENCE_NOTE;

  if (entriesA.length === 0 || entriesB.length === 0) {
    const onlySide: Side = entriesA.length > 0 ? "A" : "B";
    const missing: Side = onlySide === "A" ? "B" : "A";
    const only = placeSide(
      onlySide === "A" ? entriesA : entriesB,
      new Map(),
      COMPARE_EVIDENCE_LIMIT
    );
    const notes = [`(run ${missing} recorded no passages)`];
    if (only.hidden.length > 0) notes.push(`[… passages not shown: ${only.hidden.join(", ")}]`);
    if (only.cut || only.hidden.length > 0) notes.push(CUT_EVIDENCE_NOTE);
    const parts = [...notes, only.kept.map((p) => p.text).join(SIDE_SEPARATOR)];
    if (only.aliases.length > 0) parts.push(only.aliases.join("\n"));
    return parts.join("\n\n");
  }

  // Run A is placed first; run B's passages that A shows become aliases of A's labels.
  const half = Math.floor(COMPARE_EVIDENCE_LIMIT / 2);
  const a = placeSide(entriesA, new Map(), half);
  const shownByA = new Map(a.kept.map((p) => [p.key, p.label]));
  const b = placeSide(entriesB, shownByA, half);

  const interleaved: string[] = [];
  for (let i = 0; i < Math.max(a.kept.length, b.kept.length); i++) {
    const fromA = a.kept[i];
    const fromB = b.kept[i];
    if (fromA) interleaved.push(fromA.text);
    if (fromB) interleaved.push(fromB.text);
  }

  const notes: string[] = [];
  if (a.hidden.length > 0) notes.push(`[… passages not shown from run A: ${a.hidden.join(", ")}]`);
  if (b.hidden.length > 0) notes.push(`[… passages not shown from run B: ${b.hidden.join(", ")}]`);
  if (a.cut || b.cut || notes.length > 0) notes.unshift(CUT_EVIDENCE_NOTE);

  const parts = [...notes, interleaved.join(SIDE_SEPARATOR)];
  const aliasLines = [...a.aliases, ...b.aliases];
  if (aliasLines.length > 0) parts.push(aliasLines.join("\n"));
  return parts.join("\n\n");
}

/**
 * One presentation of the pair. `sideOfA` is the run whose answer is shown in slot A, so the
 * citation mapping names the passage labels each answer's [n] markers refer to.
 */
export function comparePrompt(
  question: string,
  answerA: string,
  answerB: string,
  evidence: string,
  sideOfA: Side = "A"
): string {
  const sideOfB: Side = sideOfA === "A" ? "B" : "A";
  const citationMap =
    evidence === NO_EVIDENCE_NOTE
      ? ""
      : `Citation markers: in Answer A, [n] refers to [${sideOfA}-n] in the evidence; in Answer B, [n] refers to [${sideOfB}-n].\n\n`;
  return `You are comparing two AI answers to the same question. Pick the better answer.

Judge in this order:
1. Grounding: which answer's substantive claims are supported by the evidence? A claim the evidence does not support counts against an answer, however fluent it reads.
2. Completeness: which answer covers what the question asks, as far as the evidence allows?
3. Clarity: which answer is easier to follow?

Do not prefer an answer because it is longer. Say "tie" when neither is clearly better.

Question: ${question}

Evidence (passages retrieved for these answers; a label such as [A-3] names the run that retrieved the passage):
${evidence}

${citationMap}Answer A:
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
  /** Agreed verdict; "tie" when the two orders disagree or either says tie */
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
    await invoke(comparePrompt(question, artA.answer, artB.answer, evidence, "A"))
  );
  const backward = parseWinner(
    await invoke(comparePrompt(question, artB.answer, artA.answer, evidence, "B"))
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
  if (judgement.forward !== "tie" && judgement.backward !== "tie") {
    return `position disagreement (forward ${judgement.forward}, swapped ${judgement.backward}): tie`;
  }
  return `tie (forward ${judgement.forward}, swapped ${judgement.backward})`;
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
  // Only both-orders-picked-a-winner splits count; a tie in one order is not a position split.
  const positionDisagreements = cases.filter(
    (c) => c.forward !== "tie" && c.backward !== "tie" && c.forward !== c.backward
  ).length;

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
