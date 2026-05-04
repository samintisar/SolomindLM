/**
 * Studio runner: drives a studio fixture through its Convex eval action,
 * serializes the structured output to text (so existing recall/judge
 * metrics work unchanged), and returns an `EvalRunArtifact` with the raw
 * payload attached on `studioOutput`.
 *
 * Mirrors the shape of [chatRunner.ts](./chatRunner.ts).
 */
import type {
  EvalFixture,
  EvalRunArtifact,
  StudioRunnerKind,
  StudioOutput,
} from "../types";
import { computeConfigHash } from "../configHash";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";
import type { StudioInvoker } from "./convexStudioInvoker";

// ─── Validation ──────────────────────────────────────────────

function validateFixture(fixture: EvalFixture): string[] {
  const errors: string[] = [];
  if (!fixture.id) errors.push("Fixture missing id");
  if (!fixture.notebookId) {
    errors.push("Studio fixture must specify a notebookId");
  }
  if (!Array.isArray(fixture.expectedItems)) {
    errors.push("expectedItems must be an array");
  } else if (
    fixture.expectedItems.length === 0 &&
    !fixture.expectedAnswer?.trim()
  ) {
    errors.push(
      "Fixture must have at least one expectedItem or a non-empty expectedAnswer"
    );
  }
  return errors;
}

function stubArtifact(
  fixture: EvalFixture,
  kind: StudioRunnerKind,
  configHash: string
): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: kind,
    configHash,
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 0,
    timestamp: new Date().toISOString(),
  };
}

// ─── Serializers (structured output → plain text) ────────────

interface FlashcardCard {
  front?: string;
  back?: string;
  question?: string;
  answer?: string;
}

function serializeFlashcards(raw: unknown): string {
  const cards = (raw as { cards?: FlashcardCard[] } | undefined)?.cards ?? [];
  return cards
    .map((c, i) => {
      const front = c.front ?? c.question ?? "";
      const back = c.back ?? c.answer ?? "";
      return `Card ${i + 1}\nQ: ${front}\nA: ${back}`;
    })
    .join("\n\n");
}

interface QuizQuestion {
  question?: string;
  prompt?: string;
  q?: string;
  options?: string[];
  choices?: string[];
  answer?: string;
  correctAnswer?: string;
}

function serializeQuiz(raw: unknown): string {
  const qs = (raw as { questions?: QuizQuestion[] } | undefined)?.questions ?? [];
  return qs
    .map((q, i) => {
      const question = q.question ?? q.prompt ?? q.q ?? "";
      const options = (q.options ?? q.choices ?? []).join("\n  - ");
      const answer = q.answer ?? q.correctAnswer ?? "";
      return `Q${i + 1}: ${question}${options ? `\n  - ${options}` : ""}\nA: ${answer}`;
    })
    .join("\n\n");
}

interface WrittenQuestion {
  question?: string;
  prompt?: string;
  expectedAnswer?: string;
  rubric?: string;
}

function serializeWrittenQuestions(raw: unknown): string {
  const qs = (raw as { questions?: WrittenQuestion[] } | undefined)?.questions ?? [];
  return qs
    .map((q, i) => {
      const question = q.question ?? q.prompt ?? "";
      const expected = q.expectedAnswer ?? q.rubric ?? "";
      return `Q${i + 1}: ${question}${expected ? `\nExpected: ${expected}` : ""}`;
    })
    .join("\n\n");
}

function serializeReport(raw: unknown): string {
  const r = raw as { content?: unknown; title?: string } | undefined;
  if (!r) return "";
  if (typeof r.content === "string") {
    return r.title ? `# ${r.title}\n\n${r.content}` : r.content;
  }
  // content may be a structured object — fall back to JSON for the LLM judge
  return JSON.stringify(r.content ?? r, null, 2);
}

interface MindmapNode {
  topic?: string;
  title?: string;
  text?: string;
  label?: string;
  children?: MindmapNode[] | null;
}

function flattenMindmap(node: MindmapNode | undefined, depth: number, lines: string[]): void {
  if (!node) return;
  const label = node.topic ?? node.title ?? node.text ?? node.label ?? "";
  if (label) lines.push(`${"  ".repeat(depth)}- ${label}`);
  for (const child of node.children ?? []) flattenMindmap(child, depth + 1, lines);
}

function extractMindmapRoot(raw: unknown): MindmapNode | undefined {
  const data = (raw as { data?: unknown } | undefined)?.data as
    | { nodeData?: MindmapNode; root?: MindmapNode }
    | MindmapNode
    | undefined;
  if (!data) return undefined;
  const wrapped = data as { nodeData?: MindmapNode; root?: MindmapNode };
  return wrapped.nodeData ?? wrapped.root ?? (data as MindmapNode);
}

function serializeMindmap(raw: unknown): string {
  const root = extractMindmapRoot(raw);
  if (!root) return "";
  const lines: string[] = [];
  flattenMindmap(root, 0, lines);
  return lines.join("\n");
}

interface InfographicPayload {
  data?: { imageUrl?: string; title?: string; prompt?: string };
  title?: string;
  status?: string;
}

function serializeInfographic(raw: unknown): string {
  const payload = raw as InfographicPayload | undefined;
  const data = payload?.data;
  const title = data?.title ?? payload?.title ?? "Untitled";
  const imageUrl = data?.imageUrl ?? "";
  const prompt = data?.prompt ?? "";
  const status = payload?.status ?? "unknown";

  const lines: string[] = [
    `Title: ${title}`,
    `Status: ${status}`,
  ];
  if (imageUrl) {
    lines.push(`Image URL: ${imageUrl}`);
  }
  if (prompt) {
    lines.push(`Prompt: ${prompt}`);
  }
  if (!imageUrl) {
    lines.push("WARNING: No image URL generated.");
  }
  return lines.join("\n");
}

function serializeSpreadsheet(raw: unknown): string {
  const data = (raw as { data?: unknown } | undefined)?.data;
  if (!data) return "";
  // Studio spreadsheets persist `data` as a CSV string from the reduce step.
  if (typeof data === "string") return data;
  const obj = data as { columns?: string[]; rows?: unknown[][]; headers?: string[] };
  const headers = obj.columns ?? obj.headers;
  const rows = obj.rows ?? [];
  if (headers && Array.isArray(rows)) {
    const head = headers.join(" | ");
    const body = rows.map((row) => (row as unknown[]).join(" | ")).join("\n");
    return `${head}\n${body}`;
  }
  return JSON.stringify(data, null, 2);
}

function serializeAudioScript(raw: unknown): string {
  return (raw as { transcript?: string } | undefined)?.transcript ?? "";
}

const SERIALIZERS: Partial<Record<StudioRunnerKind, (raw: unknown) => string>> = {
  report: serializeReport,
  flashcards: serializeFlashcards,
  quiz: serializeQuiz,
  mindmap: serializeMindmap,
  infographic: serializeInfographic,
  spreadsheet: serializeSpreadsheet,
  writtenQuestions: serializeWrittenQuestions,
  audioScript: serializeAudioScript,
};

function serialize(kind: StudioRunnerKind, raw: unknown): string {
  const fn = SERIALIZERS[kind];
  if (!fn) {
    return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  }
  return fn(raw);
}

// ─── Runner ──────────────────────────────────────────────────

export interface StudioRunnerOptions extends EvalRunnerOptions {
  /** Concrete studio runner kind to drive (resolved from fixture.runner) */
  kind: StudioRunnerKind;
}

export async function runStudioEval(
  options: StudioRunnerOptions,
  invoker?: StudioInvoker
): Promise<EvalRunnerResult> {
  const { fixture, config, dryRun, kind } = options;
  const configHash = computeConfigHash(config);

  const validationErrors = validateFixture(fixture);
  if (validationErrors.length > 0) {
    return { artifact: stubArtifact(fixture, kind, configHash), errors: validationErrors };
  }

  if (dryRun) {
    return { artifact: stubArtifact(fixture, kind, configHash), errors: [] };
  }

  if (!invoker) {
    throw new Error(
      `No StudioInvoker provided for runner "${kind}". ` +
        "Use --dry-run to validate fixtures without invoking studio actions."
    );
  }
  if (invoker.kind !== kind) {
    throw new Error(
      `Studio invoker mismatch: fixture wants "${kind}", invoker is "${invoker.kind}"`
    );
  }

  const errors: string[] = [];
  try {
    const result = await invoker.invoke({
      notebookId: fixture.notebookId!,
      documentIds: fixture.documentIds,
      studioParams: fixture.studioParams,
    });

    const studioOutput: StudioOutput = { kind, raw: result.raw };
    const answer = serialize(kind, result.raw);

    const artifact: EvalRunArtifact = {
      caseId: fixture.id,
      runner: kind,
      configHash,
      answer,
      citations: [],
      preRerankChunks: [],
      postRerankChunks: [],
      selectedChunks: [],
      subQueries: [],
      studioOutput,
      latencyMs: result.latencyMs,
      tokenUsage: result.tokenUsage,
      timestamp: new Date().toISOString(),
    };
    return { artifact, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Studio agent invocation failed (${kind}): ${message}`);
    return { artifact: stubArtifact(fixture, kind, configHash), errors };
  }
}
