import {
  type AgentGroundingCheck,
  type MessageToolCall,
  ReferenceChunk,
} from "@/shared/types/index";

// Convex HTTP actions use the .site URL. Derive from .cloud if only VITE_CONVEX_URL is set.
export const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL ||
  import.meta.env.VITE_CONVEX_URL?.replace(".cloud", ".site");
if (!CONVEX_SITE_URL) {
  throw new Error(
    "VITE_CONVEX_URL or VITE_CONVEX_SITE_URL is required for chat. Set in apps/web/.env.local (dev) or hosting env (prod)."
  );
}

/** Chat streaming uses Convex HTTP action endpoint */
export const CHAT_STREAM_URL = `${CONVEX_SITE_URL}/chat/stream`;

// ============================================================
// Types
// ============================================================

// Parsed stream data with metadata markers
export interface ParsedStreamData {
  text: string;
  references?: ReferenceChunk[];
  status?: { status: string; message: string };
  /** All grounding lines in buffer order */
  groundingChecks?: AgentGroundingCheck[];
  /** Last grounding line (backward compat) */
  groundingCheck?: AgentGroundingCheck;
  /** Merged tool call state from every __TOOL_CALL line in the buffer */
  toolCalls?: MessageToolCall[];
  /** Last tool call event (backward compat) */
  toolCall?: MessageToolCall;
  followUps?: string[];
  clarification?: { question: string };
  error?: { message: string; type?: string };
  researchPlan?: { planId: string; subQuestions: unknown[]; sourcePolicy: unknown };
  researchProgress?: { phase: string; subQuestionId?: string; sourcesFound?: number };
  /** External sources discovered during non-Deep-Research chat */
  externalSources?: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    score?: number;
  }>;
  isDone: boolean;
}

// ============================================================
// API Response Types
// ============================================================

interface ChatError {
  message: string;
  type?: string;
}

export interface SendMessageCallbacks {
  onToken: (token: string) => void;
  onReferences: (references: ReferenceChunk[]) => void;
  onStatus?: (status: string, message?: string) => void;
  /** Full merged tool-call list after each chunk (handles multiple __TOOL_CALL lines per read) */
  onToolCalls?: (toolCalls: MessageToolCall[]) => void;
  onGroundingChecks?: (checks: AgentGroundingCheck[]) => void;
  onFollowUps?: (questions: string[]) => void;
  onClarification?: (question: string) => void;
  onResearchPlan?: (plan: {
    planId: string;
    subQuestions: unknown[];
    sourcePolicy: unknown;
  }) => void;
  onResearchProgress?: (progress: {
    phase: string;
    subQuestionId?: string;
    sourcesFound?: number;
  }) => void;
  /** External sources discovered from web/academic/news/finance search */
  onExternalSources?: (
    sources: Array<{
      title: string;
      url: string;
      snippet: string;
      sourceType: string;
      score?: number;
    }>
  ) => void;
  onComplete: () => void;
  onError: (error: string | ChatError) => void;
  /** Called when stream is stopped by user */
  onStopped?: () => void;
  /** Conversation created or resolved by sendMessageOptimistic, before the HTTP stream starts. */
  onConversationReady?: (conversationId: string) => void;
}

// ============================================================
// Marker lines
// ============================================================

/**
 * Every line that starts with one of these is metadata, not answer text. The server writes each
 * marker as `\n<marker>\n` (convex/chat/_streamChatResponse.ts), so a marker always fills a line.
 */
const MARKER_PREFIXES = [
  "__REFERENCES:",
  "__STATUS:",
  "__GROUNDING:",
  "__GROUNDING_WARN:",
  "__TOOL_CALL:",
  "__FOLLOWUPS:",
  "__CLARIFICATION:",
  "__ERROR:",
  "__RESEARCH_PLAN:",
  "__RESEARCH_PROGRESS:",
  "__DONE",
  "__EXTERNAL_SOURCES:",
] as const;

function isMarkerLine(line: string): boolean {
  return MARKER_PREFIXES.some((prefix) => line.startsWith(prefix));
}

/** True while an unfinished line could still turn out to be a marker. */
function couldBecomeMarker(lineStart: string): boolean {
  return MARKER_PREFIXES.some((prefix) => prefix.startsWith(lineStart));
}

/** The markers whose callbacks fire only when their value changes. */
type TrackedField =
  | "references"
  | "status"
  | "toolCalls"
  | "groundingChecks"
  | "followUps"
  | "clarification"
  | "researchProgress";

/** Metadata accumulated from marker lines, in stream order. */
interface MarkerState {
  data: Omit<ParsedStreamData, "text" | "toolCall" | "groundingCheck"> & {
    toolCalls: MessageToolCall[];
    groundingChecks: AgentGroundingCheck[];
  };
  /** `tool\0query` → index in data.toolCalls, so a later line for the same call replaces it */
  toolCallIndex: Map<string, number>;
}

function createMarkerState(): MarkerState {
  return { data: { isDone: false, toolCalls: [], groundingChecks: [] }, toolCallIndex: new Map() };
}

function parseJsonOrSkip(json: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(json) };
  } catch {
    return undefined; // malformed payloads are ignored, the previous value stays
  }
}

function parseStatusLine(line: string): { status: string; message: string } | undefined {
  const payload = line.slice("__STATUS:".length);
  const i = payload.indexOf(":");
  if (i < 0) return undefined;
  return { status: payload.slice(0, i), message: payload.slice(i + 1) };
}

function applyToolCallLine(state: MarkerState, line: string): void {
  const parsed = parseJsonOrSkip(line.slice("__TOOL_CALL:".length));
  const raw = parsed?.value as Partial<MessageToolCall> | null | undefined;
  if (!raw?.tool || (raw.status !== "searching" && raw.status !== "done")) return;
  const query = typeof raw.query === "string" ? raw.query : "";
  const key = `${raw.tool}\0${query}`;
  const entry: MessageToolCall = {
    tool: raw.tool,
    query,
    status: raw.status,
    resultCount: raw.resultCount,
  };
  const { toolCalls } = state.data;
  const existing = state.toolCallIndex.get(key);
  if (existing !== undefined) {
    toolCalls[existing] = entry;
  } else {
    state.toolCallIndex.set(key, toolCalls.length);
    toolCalls.push(entry);
  }
}

function applyGroundingLine(state: MarkerState, line: string, isWarn: boolean): void {
  const raw = line.slice(isWarn ? "__GROUNDING_WARN:".length : "__GROUNDING:".length);
  const g = parseJsonOrSkip(raw)?.value as AgentGroundingCheck | null | undefined;
  if (
    g &&
    typeof g.passed === "boolean" &&
    Array.isArray(g.issues) &&
    typeof g.message === "string"
  ) {
    state.data.groundingChecks.push({ ...g, soft: isWarn || g.soft === true });
  }
}

/**
 * Fold one complete line into `state`. Returns null when the line is answer text, otherwise the
 * tracked field it may have changed ("other" for markers whose callbacks are not de-duplicated).
 */
function applyMarkerLine(state: MarkerState, line: string): TrackedField | "other" | null {
  const { data } = state;
  const json = (prefix: string) => parseJsonOrSkip(line.slice(prefix.length));
  if (line.startsWith("__REFERENCES:")) {
    const parsed = json("__REFERENCES:");
    if (parsed) data.references = parsed.value as ParsedStreamData["references"];
    return "references";
  }
  if (line.startsWith("__STATUS:")) {
    const parsed = parseStatusLine(line);
    if (parsed) data.status = parsed;
    return "status";
  }
  if (line.startsWith("__GROUNDING:") || line.startsWith("__GROUNDING_WARN:")) {
    applyGroundingLine(state, line, line.startsWith("__GROUNDING_WARN:"));
    return "groundingChecks";
  }
  if (line.startsWith("__TOOL_CALL:")) {
    applyToolCallLine(state, line);
    return "toolCalls";
  }
  if (line.startsWith("__FOLLOWUPS:")) {
    const parsed = json("__FOLLOWUPS:");
    if (parsed) data.followUps = parsed.value as ParsedStreamData["followUps"];
    return "followUps";
  }
  if (line.startsWith("__CLARIFICATION:")) {
    const parsed = json("__CLARIFICATION:");
    if (parsed) data.clarification = parsed.value as ParsedStreamData["clarification"];
    return "clarification";
  }
  if (line.startsWith("__ERROR:")) {
    const parsed = json("__ERROR:");
    if (parsed) data.error = parsed.value as ParsedStreamData["error"];
    return "other";
  }
  if (line.startsWith("__RESEARCH_PLAN:")) {
    const parsed = json("__RESEARCH_PLAN:");
    if (parsed) data.researchPlan = parsed.value as ParsedStreamData["researchPlan"];
    return "other";
  }
  if (line.startsWith("__RESEARCH_PROGRESS:")) {
    const parsed = json("__RESEARCH_PROGRESS:");
    if (parsed) data.researchProgress = parsed.value as ParsedStreamData["researchProgress"];
    return "researchProgress";
  }
  if (line.startsWith("__DONE")) {
    data.isDone = true;
    return "other";
  }
  if (line.startsWith("__EXTERNAL_SOURCES:")) {
    const parsed = json("__EXTERNAL_SOURCES:");
    if (parsed) data.externalSources = parsed.value as ParsedStreamData["externalSources"];
    return "other";
  }
  return null;
}

/**
 * Parse stream body with metadata markers
 * Extracts special markers like __REFERENCES:, __STATUS:, __GROUNDING:, __ERROR:, __DONE
 */
export function parseStreamBody(body: string): ParsedStreamData {
  const state = createMarkerState();
  let currentText = "";
  for (const line of body.split("\n")) {
    if (applyMarkerLine(state, line) === null) {
      currentText += line + "\n";
    }
  }
  const { toolCalls, groundingChecks } = state.data;
  return {
    ...state.data,
    text: currentText.trimEnd(),
    ...(toolCalls.length > 0 && { toolCall: toolCalls[toolCalls.length - 1] }),
    ...(groundingChecks.length > 0 && {
      groundingCheck: groundingChecks[groundingChecks.length - 1],
    }),
  };
}

/**
 * Incremental counterpart of {@link parseStreamBody}: feed it decoded chunks and it does work in
 * proportion to each chunk, not to everything received so far.
 *
 * Text is the same as parseStreamBody's: every non-marker line followed by "\n", with trailing
 * whitespace held back until more text follows (parseStreamBody trims the end). An unfinished
 * text line streams as it arrives. An unfinished line that is, or could still become, a marker
 * is held until its "\n", so partial markers never reach the text.
 */
class StreamParser {
  readonly state = createMarkerState();
  /**
   * Tracked fields touched since the last {@link takeTouched}. Tool calls start touched so the
   * first read reports the (empty) list, as the whole-buffer parser always did.
   */
  private touched = new Set<TrackedField>(["toolCalls"]);
  private lineKind: "undecided" | "text" | "marker" = "undecided";
  /** The current line while undecided (at most one marker prefix long) */
  private lineStart = "";
  private markerParts: string[] = [];
  /** Text produced since the last {@link takeText} */
  private produced: string[] = [];
  /** Trailing whitespace already produced but not yet emitted */
  private heldWhitespace = "";

  push(chunk: string): void {
    let from = 0;
    for (let nl = chunk.indexOf("\n"); nl !== -1; nl = chunk.indexOf("\n", from)) {
      this.appendToLine(chunk.slice(from, nl));
      this.endLine();
      from = nl + 1;
    }
    this.appendToLine(from === 0 ? chunk : chunk.slice(from));
  }

  /** The stream ended: the last line is complete even without a "\n". */
  end(): void {
    this.endLine();
  }

  /** New text to emit, or "" when nothing but whitespace arrived. */
  takeText(): string {
    if (this.produced.length === 0) return "";
    const pending = this.heldWhitespace + this.produced.join("");
    this.produced = [];
    const emitted = pending.trimEnd();
    this.heldWhitespace = pending.slice(emitted.length);
    return emitted;
  }

  takeTouched(): Set<TrackedField> {
    const touched = this.touched;
    this.touched = new Set();
    return touched;
  }

  private appendToLine(segment: string): void {
    if (segment === "") return;
    if (this.lineKind === "text") {
      this.produced.push(segment);
    } else if (this.lineKind === "marker") {
      this.markerParts.push(segment);
    } else {
      const lineStart = this.lineStart + segment;
      if (isMarkerLine(lineStart)) {
        this.lineKind = "marker";
        this.markerParts = [lineStart];
        this.lineStart = "";
        // "__DONE" carries no payload, so it counts as soon as it is recognised.
        if (lineStart.startsWith("__DONE")) this.state.data.isDone = true;
      } else if (couldBecomeMarker(lineStart)) {
        this.lineStart = lineStart;
      } else {
        this.lineKind = "text";
        this.produced.push(lineStart);
        this.lineStart = "";
      }
    }
  }

  private endLine(): void {
    if (this.lineKind === "marker") {
      const field = applyMarkerLine(this.state, this.markerParts.join(""));
      if (field && field !== "other") this.touched.add(field);
    } else {
      // A text line (lineStart is then ""), or one that ended before it could become a marker.
      this.produced.push(this.lineStart, "\n");
    }
    this.lineKind = "undecided";
    this.lineStart = "";
    this.markerParts = [];
  }
}

/**
 * Read a Convex persistent-text HTTP response (chat/stream, research/execute, …)
 * and invoke the same callbacks as {@link useSendMessage}.
 */
export async function consumePersistentTextStream(
  response: Response,
  callbacks: SendMessageCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body received");
  }

  const parser = new StreamParser();
  const parsed = parser.state.data;
  let completed = false;
  let lastReferencesJson: string | null = null;
  let lastToolCallsJson: string | null = null;
  let lastFollowUpsJson: string | null = null;
  let lastStatusJson: string | null = null;
  let lastGroundingJson: string | null = null;
  let lastClarificationJson: string | null = null;
  let lastResearchProgressJson: string | null = null;

  // Handle abort signal
  if (signal) {
    const handleAbort = () => {
      try {
        reader.cancel();
      } catch {
        /* stream may already be closed */
      }
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort);
  }

  try {
    while (true) {
      // Check if aborted before reading
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();

      if (value) {
        parser.push(decoder.decode(value, { stream: true }));
      }
      if (done) {
        parser.end();
      }

      const newText = parser.takeText();
      if (newText) {
        callbacks.onToken(newText);
      }

      // Only values a marker line touched in this chunk can have changed, so only those are
      // re-serialized and compared with what was last sent.
      const touched = parser.takeTouched();
      if (touched.has("references") && parsed.references) {
        const j = JSON.stringify(parsed.references);
        if (j !== lastReferencesJson) {
          lastReferencesJson = j;
          callbacks.onReferences(parsed.references);
        }
      }
      if (touched.has("status") && parsed.status) {
        const sj = JSON.stringify(parsed.status);
        if (sj !== lastStatusJson) {
          lastStatusJson = sj;
          callbacks.onStatus?.(parsed.status.status, parsed.status.message);
        }
      }
      if (touched.has("toolCalls")) {
        const j = JSON.stringify(parsed.toolCalls);
        if (j !== lastToolCallsJson) {
          lastToolCallsJson = j;
          // A copy: the parser keeps updating its own list in place.
          callbacks.onToolCalls?.([...parsed.toolCalls]);
        }
      }
      if (touched.has("followUps") && parsed.followUps) {
        const j = JSON.stringify(parsed.followUps);
        if (j !== lastFollowUpsJson) {
          lastFollowUpsJson = j;
          callbacks.onFollowUps?.(parsed.followUps);
        }
      }
      if (touched.has("clarification") && parsed.clarification) {
        const cj = JSON.stringify(parsed.clarification);
        if (cj !== lastClarificationJson) {
          lastClarificationJson = cj;
          callbacks.onClarification?.(parsed.clarification.question);
        }
      }
      if (touched.has("groundingChecks") && parsed.groundingChecks.length > 0) {
        const gj = JSON.stringify(parsed.groundingChecks);
        if (gj !== lastGroundingJson) {
          lastGroundingJson = gj;
          callbacks.onGroundingChecks?.([...parsed.groundingChecks]);
        }
      }
      if (parsed.researchPlan) {
        callbacks.onResearchPlan?.(parsed.researchPlan);
      }
      if (touched.has("researchProgress") && parsed.researchProgress) {
        const rj = JSON.stringify(parsed.researchProgress);
        if (rj !== lastResearchProgressJson) {
          lastResearchProgressJson = rj;
          callbacks.onResearchProgress?.(parsed.researchProgress);
        }
      }
      if (parsed.error) {
        callbacks.onError(parsed.error);
        break;
      }
      if (parsed.externalSources) {
        callbacks.onExternalSources?.(parsed.externalSources);
      }
      if (parsed.isDone) {
        completed = true;
        callbacks.onComplete();
        try {
          await reader.cancel();
        } catch {
          /* stream may already be closed */
        }
        break;
      }

      if (done) {
        if (!completed) {
          callbacks.onComplete();
        }
        break;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
