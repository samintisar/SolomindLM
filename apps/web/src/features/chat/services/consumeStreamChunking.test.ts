// @vitest-environment node
/**
 * Chunk-split equivalence for consumePersistentTextStream (#419).
 *
 * The oracle is the original whole-buffer loop: it re-runs parseStreamBody over everything
 * received after every chunk. The incremental reader must produce the same callback sequence for
 * any chunking, except that it holds back a line that is (or may still become) a marker until the
 * line is complete. So the oracle is fed the same chunks with every boundary that falls inside a
 * marker line moved back to that line's start.
 */
import { describe, expect, it } from "vitest";
import type { SendMessageCallbacks } from "./chatApi";
import { consumePersistentTextStream, parseStreamBody } from "./chatApi";

type CallEvent = [name: string, ...args: unknown[]];

function recordingCallbacks(): { events: CallEvent[]; callbacks: SendMessageCallbacks } {
  const events: CallEvent[] = [];
  // Clone at call time so a later mutation of a passed array cannot hide a difference.
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      events.push([name, ...structuredClone(args)]);
    };
  return {
    events,
    callbacks: {
      onToken: rec("onToken"),
      onReferences: rec("onReferences"),
      onStatus: rec("onStatus"),
      onToolCalls: rec("onToolCalls"),
      onGroundingChecks: rec("onGroundingChecks"),
      onFollowUps: rec("onFollowUps"),
      onClarification: rec("onClarification"),
      onResearchPlan: rec("onResearchPlan"),
      onResearchProgress: rec("onResearchProgress"),
      onExternalSources: rec("onExternalSources"),
      onComplete: rec("onComplete"),
      onError: rec("onError"),
    },
  };
}

/** A minimal Response whose body yields exactly these chunks, empty ones included. */
function responseFromChunks(chunks: Uint8Array[]): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i++]);
    },
  });
  return { body } as Response;
}

/** The pre-#419 reader, kept verbatim as the reference implementation. */
async function legacyConsume(response: Response, callbacks: SendMessageCallbacks): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
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
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const parsed = parseStreamBody(buffer);
      if (parsed.text.length > lastProcessedLength) {
        callbacks.onToken(parsed.text.slice(lastProcessedLength));
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
      if (parsed.researchPlan) callbacks.onResearchPlan?.(parsed.researchPlan);
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
      if (parsed.externalSources) callbacks.onExternalSources?.(parsed.externalSources);
      if (parsed.isDone) {
        completed = true;
        callbacks.onComplete();
        await reader.cancel();
        break;
      }
      if (done) {
        if (!completed) callbacks.onComplete();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ------------------------------------------------------------
// Streams, written the way the server appends them (markers wrapped in "\n")
// ------------------------------------------------------------

const marker = (name: string, payload?: unknown) =>
  payload === undefined ? `\n__${name}\n` : `\n__${name}:${JSON.stringify(payload)}\n`;

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    sourceId: `doc-${i}`,
    sourceTitle: `Source ${i} — résumé`,
    content: `Chunk ${i}: naïve café 日本語 🎉 lorem ipsum`,
    chunkIndex: i,
    similarity: 0.9 - i / 100,
  }));

const CHAT_STREAM = [
  "\n__STATUS:searching:Looking through your sources\n",
  marker("TOOL_CALL", { tool: "web_search", query: "café prices", status: "searching" }),
  marker("TOOL_CALL", { tool: "academic_search", query: "", status: "searching" }),
  "Here is the ",
  "answer — naïve café 日本語 🎉 ",
  "with slice boundaries. ",
  "Trailing spaces   ",
  marker("TOOL_CALL", {
    tool: "web_search",
    query: "café prices",
    status: "done",
    resultCount: 3,
  }),
  "\n__STATUS:writing:Writing the answer: part 1\n",
  "\n__STATUS:writing:Writing the answer: part 1\n",
  "Next paragraph [1].\n\n- bullet 🎉\n- bullet two  \n",
  marker("REFERENCES", refs(2)),
  "More text after refs [2].",
  marker("REFERENCES", refs(2)),
  marker("REFERENCES", refs(3)),
  marker("GROUNDING", { passed: false, issues: ["unsupported claim"], message: "Check [2]" }),
  marker("GROUNDING_WARN", { passed: true, issues: [], message: "Soft pass", soft: true }),
  marker("FOLLOWUPS", ["What about X?", "Why 日本?"]),
  marker("FOLLOWUPS", ["What about X?", "Why 日本?"]),
  marker("EXTERNAL_SOURCES", [
    { title: "Paper", url: "https://example.com", snippet: "abc", sourceType: "web", score: 0.8 },
  ]),
  "\n__STATUS:completed:Done\n",
  marker("DONE"),
].join("");

const RESEARCH_STREAM = [
  marker("RESEARCH_PROGRESS", { phase: "planning" }),
  marker("RESEARCH_PROGRESS", { phase: "planning" }),
  marker("RESEARCH_PLAN", {
    planId: "p1",
    subQuestions: [{ id: "q1", text: "Ünïcode?" }],
    sourcePolicy: { channels: ["web"] },
  }),
  marker("RESEARCH_PROGRESS", { phase: "searching", subQuestionId: "q1", sourcesFound: 4 }),
  "Report body with emoji 🧪 and CJK 研究.\n\n",
  marker("CLARIFICATION", { question: "Which decade — 1990s?" }),
  marker("RESEARCH_PROGRESS", { phase: "writing" }),
  "Final words.",
  marker("DONE"),
].join("");

const ERROR_STREAM = [
  "Partial answer 🎉 ",
  marker("REFERENCES", refs(2)),
  "more ",
  marker("ERROR", { message: "Rate limited — retry", type: "rate_limit" }),
  "text after the error",
  marker("DONE"),
].join("");

/** No __DONE, malformed and odd markers, and a final unterminated text line. */
const EDGE_STREAM = [
  "\n__REFERENCES:not-json\n",
  "\n__STATUS:nocolon\n",
  '\n__TOOL_CALL:{"tool":"x","status":"bogus"}\n',
  '\n__GROUNDING:{"passed":"yes"}\n',
  "Line with __DONE inside it and __REFERENCES: too.\n",
  "\n__REFERENCES:null\n",
  "\r\nWindows line\r\n",
  "\n__STATUS:thinking:message:with:colons\n",
  "last line without newline 日本",
].join("");

const STREAMS: Record<string, string> = {
  chat: CHAT_STREAM,
  research: RESEARCH_STREAM,
  error: ERROR_STREAM,
  edge: EDGE_STREAM,
};

// ------------------------------------------------------------
// Chunking helpers
// ------------------------------------------------------------

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
];

function chunksAt(bytes: Uint8Array, cuts: number[]): Uint8Array[] {
  const edges = [0, ...cuts, bytes.length];
  return edges.slice(1).map((end, i) => bytes.slice(edges[i], end));
}

/**
 * Move every cut that lands inside a marker line (after its first byte, up to and including the
 * position just before its "\n") back to the line start. `__DONE` is recognised as soon as its
 * six characters are in, so only cuts inside "__DONE" itself move.
 */
function holdBackMarkerLines(bytes: Uint8Array, cuts: number[]): number[] {
  const decoder = new TextDecoder();
  const spans: Array<{ start: number; end: number; holdUntil: number }> = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      const line = decoder.decode(bytes.slice(start, i));
      if (MARKER_PREFIXES.some((p) => line.startsWith(p))) {
        spans.push({ start, end: i, holdUntil: line.startsWith("__DONE") ? start + 5 : i });
      }
      start = i + 1;
    }
  }
  return cuts.map((cut) => {
    const span = spans.find((s) => cut > s.start && cut <= s.holdUntil);
    return span ? span.start : cut;
  });
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function chunkings(bytes: Uint8Array): Array<{ label: string; cuts: number[] }> {
  const n = bytes.length;
  const all: Array<{ label: string; cuts: number[] }> = [
    { label: "one chunk", cuts: [] },
    { label: "1-byte chunks", cuts: Array.from({ length: n - 1 }, (_, i) => i + 1) },
  ];
  for (const size of [2, 3, 7, 64]) {
    all.push({
      label: `${size}-byte chunks`,
      cuts: Array.from({ length: Math.ceil(n / size) - 1 }, (_, i) => (i + 1) * size),
    });
  }
  for (let cut = 1; cut < n; cut++) all.push({ label: `split at ${cut}`, cuts: [cut] });
  const rand = seededRandom(419);
  for (let r = 0; r < 40; r++) {
    const cuts = new Set<number>();
    const count = 1 + Math.floor(rand() * 30);
    for (let k = 0; k < count; k++) cuts.add(1 + Math.floor(rand() * (n - 1)));
    all.push({ label: `random #${r}`, cuts: [...cuts].sort((a, b) => a - b) });
  }
  return all;
}

async function run(
  consume: (r: Response, c: SendMessageCallbacks) => Promise<void>,
  chunks: Uint8Array[]
): Promise<CallEvent[]> {
  const { events, callbacks } = recordingCallbacks();
  await consume(responseFromChunks(chunks), callbacks);
  return events;
}

const joinedText = (events: CallEvent[]) =>
  events
    .filter((e) => e[0] === "onToken")
    .map((e) => e[1])
    .join("");

// ------------------------------------------------------------
// Tests
// ------------------------------------------------------------

describe("consumePersistentTextStream — chunk-split equivalence", () => {
  for (const [name, stream] of Object.entries(STREAMS)) {
    it(`matches the whole-buffer parser for every chunking of the ${name} stream`, async () => {
      const bytes = new TextEncoder().encode(stream);
      const whole = await run(legacyConsume, [bytes]);
      for (const { label, cuts } of chunkings(bytes)) {
        const actual = await run(consumePersistentTextStream, chunksAt(bytes, cuts));
        const expected = await run(
          legacyConsume,
          chunksAt(bytes, holdBackMarkerLines(bytes, cuts))
        );
        expect(actual, `${name}: ${label}`).toEqual(expected);
        // An error stops reading, so text after it depends on where the chunks end.
        if (name !== "error") {
          expect(joinedText(actual), `${name}: ${label}`).toBe(joinedText(whole));
        }
      }
    }, 30_000);
  }

  it("never leaks a partial marker into the text", async () => {
    const stream = `Hello there${marker("REFERENCES", refs(1))}World${marker("DONE")}`;
    const bytes = new TextEncoder().encode(stream);
    for (let cut = 1; cut < bytes.length; cut++) {
      const events = await run(consumePersistentTextStream, chunksAt(bytes, [cut]));
      const tokens = events.filter((e) => e[0] === "onToken").map((e) => e[1] as string);
      expect(tokens.join(""), `split at ${cut}`).toBe("Hello there\nWorld");
      for (const token of tokens) expect(token, `split at ${cut}`).not.toContain("__");
    }
  });

  it("emits a status once, not once per partial message", async () => {
    const stream = "\n__STATUS:searching:Looking through sources\nAnswer";
    const bytes = new TextEncoder().encode(stream);
    const cuts = Array.from({ length: bytes.length - 1 }, (_, i) => i + 1);
    const events = await run(consumePersistentTextStream, chunksAt(bytes, cuts));
    expect(events.filter((e) => e[0] === "onStatus")).toEqual([
      ["onStatus", "searching", "Looking through sources"],
    ]);
  });

  it("streams a text line before its newline arrives", async () => {
    const stream = "First words of a long line, then the rest\n";
    const bytes = new TextEncoder().encode(stream);
    const cuts = Array.from({ length: bytes.length - 1 }, (_, i) => i + 1);
    const events = await run(consumePersistentTextStream, chunksAt(bytes, cuts));
    const tokens = events.filter((e) => e[0] === "onToken").map((e) => e[1]);
    // One token per non-space character: spaces wait for the next word (trimEnd), nothing waits for "\n".
    expect(tokens[0]).toBe("F");
    expect(tokens.join("")).toBe("First words of a long line, then the rest");
  });

  it("keeps the same final text for lines that start like a marker", async () => {
    const stream =
      "_italic_ start\n__bold__ line\n__DON'T panic, this is text\n__REFERENCES without colon\nend";
    const bytes = new TextEncoder().encode(stream);
    const whole = joinedText(await run(legacyConsume, [bytes]));
    for (const { label, cuts } of chunkings(bytes)) {
      const actual = await run(consumePersistentTextStream, chunksAt(bytes, cuts));
      expect(joinedText(actual), label).toBe(whole);
    }
  });

  it("passes a fresh tool-call array to each onToolCalls call", async () => {
    const seen: unknown[][] = [];
    const { callbacks } = recordingCallbacks();
    callbacks.onToolCalls = (tcs) => seen.push(tcs);
    const first = marker("TOOL_CALL", { tool: "web_search", query: "a", status: "searching" });
    const second = marker("TOOL_CALL", {
      tool: "web_search",
      query: "a",
      status: "done",
      resultCount: 2,
    });
    const encoder = new TextEncoder();
    await consumePersistentTextStream(
      responseFromChunks([encoder.encode(first), encoder.encode(second)]),
      callbacks
    );
    expect(seen.length).toBe(2);
    expect(seen[0]).not.toBe(seen[1]);
    // The first list must not have been updated in place by the second line.
    expect(seen[0]).toEqual([{ tool: "web_search", query: "a", status: "searching" }]);
  });
});
