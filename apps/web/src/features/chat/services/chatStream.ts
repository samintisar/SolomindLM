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

// API response format (with created_at as string)
export interface ApiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  references?: ReferenceChunk[];
  metadata?: Record<string, any>;
}

// ============================================================
// API Response Types
// ============================================================

export interface ChatHistoryResponse {
  conversationId: string;
  title: string;
  messages: ApiMessage[];
}

export interface ChatError {
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
}

function mergeToolCallsFromLines(lines: string[]): MessageToolCall[] {
  const toolCalls: MessageToolCall[] = [];
  const keyToIndex = new Map<string, number>();
  for (const line of lines) {
    if (!line.startsWith("__TOOL_CALL:")) continue;
    try {
      const raw = JSON.parse(line.slice("__TOOL_CALL:".length)) as Partial<MessageToolCall>;
      if (!raw.tool || (raw.status !== "searching" && raw.status !== "done")) continue;
      const query = typeof raw.query === "string" ? raw.query : "";
      const key = `${raw.tool}\0${query}`;
      const entry: MessageToolCall = {
        tool: raw.tool,
        query,
        status: raw.status,
        resultCount: raw.resultCount,
      };
      const existing = keyToIndex.get(key);
      if (existing !== undefined) {
        toolCalls[existing] = entry;
      } else {
        keyToIndex.set(key, toolCalls.length);
        toolCalls.push(entry);
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return toolCalls;
}

function parseStatusLine(line: string): { status: string; message: string } | undefined {
  const payload = line.slice("__STATUS:".length);
  const i = payload.indexOf(":");
  if (i < 0) return undefined;
  return { status: payload.slice(0, i), message: payload.slice(i + 1) };
}

function collectGroundingLines(lines: string[]): AgentGroundingCheck[] {
  const checks: AgentGroundingCheck[] = [];
  for (const line of lines) {
    const isWarn = line.startsWith("__GROUNDING_WARN:");
    if (!line.startsWith("__GROUNDING:") && !isWarn) continue;
    try {
      const raw = line.slice(isWarn ? "__GROUNDING_WARN:".length : "__GROUNDING:".length);
      const g = JSON.parse(raw) as AgentGroundingCheck;
      if (
        g &&
        typeof g.passed === "boolean" &&
        Array.isArray(g.issues) &&
        typeof g.message === "string"
      ) {
        checks.push({ ...g, soft: isWarn || g.soft === true });
      }
    } catch {
      // ignore
    }
  }
  return checks;
}

/**
 * Parse stream body with metadata markers
 * Extracts special markers like __REFERENCES:, __STATUS:, __GROUNDING:, __ERROR:, __DONE
 */
export function parseStreamBody(body: string): ParsedStreamData {
  const result: ParsedStreamData = {
    text: "",
    isDone: false,
  };

  // Process the body line by line
  const lines = body.split("\n");
  let currentText = "";

  for (const line of lines) {
    if (line.startsWith("__REFERENCES:")) {
      try {
        const jsonStr = line.slice("__REFERENCES:".length);
        result.references = JSON.parse(jsonStr);
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__STATUS:")) {
      try {
        const parsed = parseStatusLine(line);
        if (parsed) {
          result.status = parsed;
        }
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__GROUNDING:") || line.startsWith("__GROUNDING_WARN:")) {
      // Collected into result.groundingChecks after the loop
    } else if (line.startsWith("__TOOL_CALL:")) {
      // Merged into result.toolCalls after the loop
    } else if (line.startsWith("__FOLLOWUPS:")) {
      try {
        result.followUps = JSON.parse(line.slice("__FOLLOWUPS:".length));
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__CLARIFICATION:")) {
      try {
        result.clarification = JSON.parse(line.slice("__CLARIFICATION:".length));
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__ERROR:")) {
      try {
        const jsonStr = line.slice("__ERROR:".length);
        result.error = JSON.parse(jsonStr);
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__RESEARCH_PLAN:")) {
      try {
        result.researchPlan = JSON.parse(line.slice("__RESEARCH_PLAN:".length));
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__RESEARCH_PROGRESS:")) {
      try {
        result.researchProgress = JSON.parse(line.slice("__RESEARCH_PROGRESS:".length));
      } catch {
        // Ignore parse errors
      }
    } else if (line.startsWith("__DONE")) {
      result.isDone = true;
    } else if (line.startsWith("__EXTERNAL_SOURCES:")) {
      try {
        result.externalSources = JSON.parse(line.slice("__EXTERNAL_SOURCES:".length));
      } catch {
        // Ignore parse errors
      }
    } else {
      // Regular text content
      currentText += line + "\n";
    }
  }

  result.text = currentText.trimEnd();
  result.toolCalls = mergeToolCallsFromLines(lines);
  if (result.toolCalls.length > 0) {
    result.toolCall = result.toolCalls[result.toolCalls.length - 1];
  }
  result.groundingChecks = collectGroundingLines(lines);
  if (result.groundingChecks.length > 0) {
    result.groundingCheck = result.groundingChecks[result.groundingChecks.length - 1];
  }
  return result;
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

  let buffer = "";
  let lastProcessedLength = 0;
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
        buffer += decoder.decode(value, { stream: true });
      }

      const parsed = parseStreamBody(buffer);

      if (parsed.text.length > lastProcessedLength) {
        const newText = parsed.text.slice(lastProcessedLength);
        callbacks.onToken(newText);
        lastProcessedLength = parsed.text.length;
      }

      if (parsed.references) {
        const j = JSON.stringify(parsed.references);
        if (j !== lastReferencesJson) {
          lastReferencesJson = j;
          callbacks.onReferences(parsed.references);
        }
      }
      if (parsed.status) {
        const sj = JSON.stringify(parsed.status);
        if (sj !== lastStatusJson) {
          lastStatusJson = sj;
          callbacks.onStatus?.(parsed.status.status, parsed.status.message);
        }
      }
      if (parsed.toolCalls) {
        const j = JSON.stringify(parsed.toolCalls);
        if (j !== lastToolCallsJson) {
          lastToolCallsJson = j;
          callbacks.onToolCalls?.(parsed.toolCalls);
        }
      }
      if (parsed.followUps) {
        const j = JSON.stringify(parsed.followUps);
        if (j !== lastFollowUpsJson) {
          lastFollowUpsJson = j;
          callbacks.onFollowUps?.(parsed.followUps);
        }
      }
      if (parsed.clarification) {
        const cj = JSON.stringify(parsed.clarification);
        if (cj !== lastClarificationJson) {
          lastClarificationJson = cj;
          callbacks.onClarification?.(parsed.clarification.question);
        }
      }
      if (parsed.groundingChecks && parsed.groundingChecks.length > 0) {
        const gj = JSON.stringify(parsed.groundingChecks);
        if (gj !== lastGroundingJson) {
          lastGroundingJson = gj;
          callbacks.onGroundingChecks?.(parsed.groundingChecks);
        }
      }
      if (parsed.researchPlan) {
        callbacks.onResearchPlan?.(parsed.researchPlan);
      }
      if (parsed.researchProgress) {
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
