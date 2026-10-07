import type {
  AgentGroundingCheck,
  ExternalSource,
  MessageToolCall,
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
  /** All grounding lines in stream order */
  groundingChecks: AgentGroundingCheck[];
  /** Merged tool call state from every __TOOL_CALL line, keyed by tool + query */
  toolCalls: MessageToolCall[];
  followUps?: string[];
  clarification?: { question: string };
  error?: { message: string; type?: string };
  researchPlan?: { planId: string; subQuestions: unknown[]; sourcePolicy: unknown };
  researchProgress?: { phase: string; subQuestionId?: string; sourcesFound?: number };
  /** External sources discovered during non-Deep-Research chat */
  externalSources?: ExternalSource[];
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
  onExternalSources?: (sources: ExternalSource[]) => void;
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

/** Everything a stream carries besides its text. */
type StreamFields = Omit<ParsedStreamData, "text">;

function createStreamFields(): StreamFields {
  return { isDone: false, toolCalls: [], groundingChecks: [] };
}

/**
 * Folds one marker payload into `fields`. List fields are replaced, never mutated, so a
 * shallow copy of `fields` can take a provisional line without touching the original.
 */
type ApplyMarker = (fields: StreamFields, payload: string) => void;

type JsonFieldKey =
  | "references"
  | "followUps"
  | "clarification"
  | "error"
  | "researchPlan"
  | "researchProgress"
  | "externalSources";

/** Last successfully parsed line wins; malformed JSON is ignored. */
function jsonField(key: JsonFieldKey): ApplyMarker {
  return (fields, payload) => {
    try {
      fields[key] = JSON.parse(payload);
    } catch {
      // ignore malformed JSON
    }
  };
}

const applyStatus: ApplyMarker = (fields, payload) => {
  const i = payload.indexOf(":");
  if (i >= 0) {
    fields.status = { status: payload.slice(0, i), message: payload.slice(i + 1) };
  }
};

const toolCallKey = (toolCall: MessageToolCall) => `${toolCall.tool}\0${toolCall.query}`;

/** Merges by tool + query: a later line for the same key replaces the entry in place. */
const applyToolCall: ApplyMarker = (fields, payload) => {
  try {
    const raw = JSON.parse(payload) as Partial<MessageToolCall>;
    if (!raw.tool || (raw.status !== "searching" && raw.status !== "done")) return;
    const entry: MessageToolCall = {
      tool: raw.tool,
      query: typeof raw.query === "string" ? raw.query : "",
      status: raw.status,
      resultCount: raw.resultCount,
    };
    const key = toolCallKey(entry);
    const index = fields.toolCalls.findIndex((toolCall) => toolCallKey(toolCall) === key);
    fields.toolCalls =
      index < 0
        ? [...fields.toolCalls, entry]
        : fields.toolCalls.map((toolCall, i) => (i === index ? entry : toolCall));
  } catch {
    // ignore malformed JSON
  }
};

function groundingMarker(soft: boolean): ApplyMarker {
  return (fields, payload) => {
    try {
      const g = JSON.parse(payload) as AgentGroundingCheck;
      if (
        g &&
        typeof g.passed === "boolean" &&
        Array.isArray(g.issues) &&
        typeof g.message === "string"
      ) {
        fields.groundingChecks = [
          ...fields.groundingChecks,
          { ...g, soft: soft || g.soft === true },
        ];
      }
    } catch {
      // ignore malformed JSON
    }
  };
}

interface StreamMarker {
  prefix: string;
  apply: ApplyMarker;
}

/** A line starting with one of these prefixes is metadata, never answer text. */
const STREAM_MARKERS: readonly StreamMarker[] = [
  { prefix: "__REFERENCES:", apply: jsonField("references") },
  { prefix: "__STATUS:", apply: applyStatus },
  { prefix: "__GROUNDING:", apply: groundingMarker(false) },
  { prefix: "__GROUNDING_WARN:", apply: groundingMarker(true) },
  { prefix: "__TOOL_CALL:", apply: applyToolCall },
  { prefix: "__FOLLOWUPS:", apply: jsonField("followUps") },
  { prefix: "__CLARIFICATION:", apply: jsonField("clarification") },
  { prefix: "__ERROR:", apply: jsonField("error") },
  { prefix: "__RESEARCH_PLAN:", apply: jsonField("researchPlan") },
  { prefix: "__RESEARCH_PROGRESS:", apply: jsonField("researchProgress") },
  {
    prefix: "__DONE",
    apply: (fields) => {
      fields.isDone = true;
    },
  },
  { prefix: "__EXTERNAL_SOURCES:", apply: jsonField("externalSources") },
];

function findMarker(line: string): StreamMarker | undefined {
  if (!line.startsWith("__")) return undefined;
  return STREAM_MARKERS.find((marker) => line.startsWith(marker.prefix));
}

// ============================================================
// Incremental parsing
// ============================================================

/**
 * The answer text is every non-marker line joined by "\n", then trimEnd()'d. This tracks
 * that text as lines arrive and hands out only its growth past what was already emitted,
 * so trailing whitespace is held back until non-whitespace follows it.
 *
 * Only the committed text past the emitted length is kept in memory. Emitted length can
 * run ahead of the committed text when an unterminated tail was emitted as text and then
 * turned into a marker line (e.g. "__" became "__REFERENCES:…"); later text below that
 * length is skipped, exactly as slicing the whole re-parsed text would.
 */
class StreamText {
  /** Whether any complete text line was committed (a "\n" separates the next one). */
  private hasLine = false;
  /** Length of all committed text lines joined by "\n". */
  private committedLength = 0;
  /** That length after trimEnd(). */
  private committedTrimmedLength = 0;
  /** Committed text from offset `pendingStart` on. */
  private pending = "";
  private pendingStart = 0;
  private emittedLength = 0;

  commitLine(line: string): void {
    const separator = this.hasLine ? "\n" : "";
    const trimmedLength = line.trimEnd().length;
    if (trimmedLength > 0) {
      this.committedTrimmedLength = this.committedLength + separator.length + trimmedLength;
    }
    this.pending += separator + line;
    this.committedLength += separator.length + line.length;
    this.hasLine = true;
  }

  /**
   * Text newly visible with `tail` (the unterminated last line, or "" when it is a marker)
   * appended provisionally; "" when the visible text did not grow.
   */
  take(tail: string): string {
    const trimmedTail = tail.trimEnd();
    let visibleLength = this.committedTrimmedLength;
    let window = this.pending;
    if (trimmedTail.length > 0) {
      const separator = this.hasLine ? "\n" : "";
      visibleLength = this.committedLength + separator.length + trimmedTail.length;
      window = this.pending + separator + trimmedTail;
    }
    if (visibleLength <= this.emittedLength) return "";

    const token = window.slice(
      this.emittedLength - this.pendingStart,
      visibleLength - this.pendingStart
    );
    this.emittedLength = visibleLength;
    const nextStart = Math.min(visibleLength, this.committedLength);
    this.pending = this.pending.slice(nextStart - this.pendingStart);
    this.pendingStart = nextStart;
    return token;
  }
}

/**
 * Left fold over complete ("\n"-terminated) lines. The unterminated tail is applied
 * provisionally on each push: as text if it is not (yet) a marker line, otherwise to a
 * copy of the committed fields. A tail that starts with "__" but does not match a full
 * marker prefix yet is treated as text.
 */
class StreamParser {
  private readonly committed = createStreamFields();
  private readonly text = new StreamText();
  private tail = "";

  /** Folds `chunk` in; returns the fields as of now and any newly visible text. */
  push(chunk: string): { fields: StreamFields; token: string } {
    const lastNewline = chunk.lastIndexOf("\n");
    if (lastNewline < 0) {
      this.tail += chunk;
    } else {
      const lines = (this.tail + chunk.slice(0, lastNewline)).split("\n");
      this.tail = chunk.slice(lastNewline + 1);
      for (const line of lines) {
        const marker = findMarker(line);
        if (marker) marker.apply(this.committed, line.slice(marker.prefix.length));
        else this.text.commitLine(line);
      }
    }

    const tailMarker = findMarker(this.tail);
    if (!tailMarker) return { fields: this.committed, token: this.text.take(this.tail) };
    const fields = { ...this.committed };
    tailMarker.apply(fields, this.tail.slice(tailMarker.prefix.length));
    return { fields, token: this.text.take("") };
  }
}

/**
 * Parse stream body with metadata markers
 * Extracts special markers like __REFERENCES:, __STATUS:, __GROUNDING:, __ERROR:, __DONE
 */
export function parseStreamBody(body: string): ParsedStreamData {
  // One push of the whole body: every line is folded and the emitted text is all of it.
  const { fields, token } = new StreamParser().push(body);
  return { ...fields, text: token };
}

/**
 * Wraps `emit` so it only fires when `value` changed since the last call: same object
 * (skips the stringify), else by JSON. Incremental parsing keeps a field's object until a
 * new line sets it, so the identity check covers almost every chunk.
 */
function emitIfChanged<T>(emit: (value: T) => void): (value: T) => void {
  let lastValue: T | undefined;
  let lastJson: string | null = null;
  return (value) => {
    if (value === lastValue) return;
    lastValue = value;
    const json = JSON.stringify(value);
    if (json === lastJson) return;
    lastJson = json;
    emit(value);
  };
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
  let completed = false;
  const emitReferences = emitIfChanged((refs: ReferenceChunk[]) => callbacks.onReferences(refs));
  const emitStatus = emitIfChanged((s: NonNullable<StreamFields["status"]>) =>
    callbacks.onStatus?.(s.status, s.message)
  );
  const emitToolCalls = emitIfChanged((toolCalls: MessageToolCall[]) =>
    callbacks.onToolCalls?.(toolCalls)
  );
  const emitFollowUps = emitIfChanged((questions: string[]) => callbacks.onFollowUps?.(questions));
  const emitClarification = emitIfChanged((c: NonNullable<StreamFields["clarification"]>) =>
    callbacks.onClarification?.(c.question)
  );
  const emitGroundingChecks = emitIfChanged((checks: AgentGroundingCheck[]) =>
    callbacks.onGroundingChecks?.(checks)
  );
  const emitResearchProgress = emitIfChanged(
    (progress: NonNullable<StreamFields["researchProgress"]>) =>
      callbacks.onResearchProgress?.(progress)
  );

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
      const { fields: parsed, token } = parser.push(
        value ? decoder.decode(value, { stream: true }) : ""
      );

      if (token) callbacks.onToken(token);
      if (parsed.references) emitReferences(parsed.references);
      if (parsed.status) emitStatus(parsed.status);
      emitToolCalls(parsed.toolCalls);
      if (parsed.followUps) emitFollowUps(parsed.followUps);
      if (parsed.clarification) emitClarification(parsed.clarification);
      if (parsed.groundingChecks.length > 0) emitGroundingChecks(parsed.groundingChecks);
      // Plan and external sources are re-sent on every chunk once present.
      if (parsed.researchPlan) callbacks.onResearchPlan?.(parsed.researchPlan);
      if (parsed.researchProgress) emitResearchProgress(parsed.researchProgress);
      if (parsed.error) {
        callbacks.onError(parsed.error);
        break;
      }
      if (parsed.externalSources) callbacks.onExternalSources?.(parsed.externalSources);
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
