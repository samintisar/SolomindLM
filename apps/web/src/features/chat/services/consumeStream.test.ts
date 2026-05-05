// @vitest-environment node
import { describe, it, expect } from "vitest";
import { consumePersistentTextStream } from "../services/chatApi";
import type { SendMessageCallbacks } from "../services/chatApi";

function createMockCallbacks(): SendMessageCallbacks & {
  calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {
    onToken: [],
    onReferences: [],
    onStatus: [],
    onToolCalls: [],
    onGroundingChecks: [],
    onFollowUps: [],
    onClarification: [],
    onResearchPlan: [],
    onResearchProgress: [],
    onExternalSources: [],
    onComplete: [],
    onError: [],
  };

  return {
    calls,
    onToken: (token: string) => calls.onToken.push([token]),
    onReferences: (refs: unknown[]) => calls.onReferences.push([refs]),
    onStatus: (status: string, message?: string) => calls.onStatus.push([status, message]),
    onToolCalls: (tcs: unknown[]) => calls.onToolCalls.push([tcs]),
    onGroundingChecks: (checks: unknown[]) => calls.onGroundingChecks.push([checks]),
    onFollowUps: (qs: string[]) => calls.onFollowUps.push([qs]),
    onClarification: (q: string) => calls.onClarification.push([q]),
    onResearchPlan: (plan: unknown) => calls.onResearchPlan.push([plan]),
    onResearchProgress: (p: unknown) => calls.onResearchProgress.push([p]),
    onExternalSources: (sources: unknown[]) => calls.onExternalSources.push([sources]),
    onComplete: () => calls.onComplete.push([]),
    onError: (err: unknown) => calls.onError.push([err]),
  };
}

function createStreamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (index >= lines.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(lines[index] + "\n"));
      index++;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

describe("consumePersistentTextStream", () => {
  it("calls onToken with streamed text", async () => {
    const response = createStreamResponse(["Hello ", "world", "__DONE"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onToken.length).toBeGreaterThan(0);
    // Tokens should accumulate: "Hello " then "world"
    const allTokens = callbacks.calls.onToken.map((c) => c[0]).join("");
    expect(allTokens).toContain("Hello");
    expect(allTokens).toContain("world");
  });

  it("calls onComplete when __DONE is received", async () => {
    const response = createStreamResponse(["text", "__DONE"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onComplete).toHaveLength(1);
  });

  it("calls onComplete when stream ends without __DONE", async () => {
    const response = createStreamResponse(["some text"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onComplete).toHaveLength(1);
  });

  it("calls onReferences with parsed references", async () => {
    const refs = [{ documentId: "d1", sourceTitle: "Source 1", content: "chunk", similarity: 0.9 }];
    const response = createStreamResponse([
      "text",
      `__REFERENCES:${JSON.stringify(refs)}`,
      "__DONE",
    ]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onReferences.length).toBeGreaterThan(0);
    expect(callbacks.calls.onReferences[0][0]).toEqual(refs);
  });

  it("calls onStatus with status message", async () => {
    const response = createStreamResponse(["__STATUS:thinking:Analyzing...", "text", "__DONE"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onStatus.length).toBeGreaterThan(0);
    expect(callbacks.calls.onStatus[0]).toEqual(["thinking", "Analyzing..."]);
  });

  it("calls onToolCalls with merged tool calls", async () => {
    const tc1 = { tool: "web_search", query: "test", status: "searching" as const };
    const tc2 = { tool: "web_search", query: "test", status: "done" as const, resultCount: 3 };
    const response = createStreamResponse([
      `__TOOL_CALL:${JSON.stringify(tc1)}`,
      `__TOOL_CALL:${JSON.stringify(tc2)}`,
      "__DONE",
    ]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onToolCalls.length).toBeGreaterThan(0);

    const lastToolCalls = callbacks.calls.onToolCalls[
      callbacks.calls.onToolCalls.length - 1
    ][0] as any[];
    expect(lastToolCalls).toHaveLength(1);
    expect(lastToolCalls[0].status).toBe("done");
    expect(lastToolCalls[0].resultCount).toBe(3);
  });

  it("calls onGroundingChecks with parsed checks", async () => {
    const check = { passed: true, issues: [], message: "Grounded" };
    const response = createStreamResponse([`__GROUNDING:${JSON.stringify(check)}`, "__DONE"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onGroundingChecks.length).toBeGreaterThan(0);
  });

  it("calls onFollowUps with parsed questions", async () => {
    const questions = ["What about X?", "Can you explain Y?"];
    const response = createStreamResponse([`__FOLLOWUPS:${JSON.stringify(questions)}`, "__DONE"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onFollowUps.length).toBeGreaterThan(0);
    expect(callbacks.calls.onFollowUps[0][0]).toEqual(questions);
  });

  it("calls onClarification with question", async () => {
    const clarification = { question: "Which topic?" };
    const response = createStreamResponse([
      `__CLARIFICATION:${JSON.stringify(clarification)}`,
      "__DONE",
    ]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onClarification.length).toBeGreaterThan(0);
    expect(callbacks.calls.onClarification[0][0]).toBe("Which topic?");
  });

  it("calls onResearchPlan with parsed plan", async () => {
    const plan = { planId: "p1", subQuestions: ["q1"], sourcePolicy: { channels: ["web"] } };
    const response = createStreamResponse([`__RESEARCH_PLAN:${JSON.stringify(plan)}`, "__DONE"]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onResearchPlan.length).toBeGreaterThan(0);
    expect(callbacks.calls.onResearchPlan[0][0]).toEqual(plan);
  });

  it("calls onExternalSources with parsed sources", async () => {
    const sources = [
      { title: "Paper", url: "https://example.com", snippet: "abc", sourceType: "web", score: 0.8 },
    ];
    const response = createStreamResponse([
      `__EXTERNAL_SOURCES:${JSON.stringify(sources)}`,
      "__DONE",
    ]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onExternalSources.length).toBeGreaterThan(0);
    expect(callbacks.calls.onExternalSources[0][0]).toEqual(sources);
  });

  it("calls onError when __ERROR marker received", async () => {
    const error = { message: "Rate limited", type: "rate_limit" };
    const response = createStreamResponse([`__ERROR:${JSON.stringify(error)}`]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onError.length).toBeGreaterThan(0);
    expect(callbacks.calls.onError[0][0]).toEqual(error);
  });

  it("does not call onComplete when error is received", async () => {
    const error = { message: "Failed" };
    const response = createStreamResponse([`__ERROR:${JSON.stringify(error)}`]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onComplete).toHaveLength(0);
  });

  it("throws when response has no body", async () => {
    const response = new Response(null, { status: 200 });
    const callbacks = createMockCallbacks();

    await expect(consumePersistentTextStream(response, callbacks)).rejects.toThrow(
      "No response body received"
    );
  });

  it("handles empty stream", async () => {
    const response = createStreamResponse([]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onComplete).toHaveLength(1);
    expect(callbacks.calls.onToken).toHaveLength(0);
  });

  it("handles full realistic multi-chunk stream", async () => {
    const response = createStreamResponse([
      "__STATUS:thinking:Processing...",
      "Here is the answer.",
      "",
      "Some more text [1].",
      `__REFERENCES:[{"id":1,"sourceId":"d1","sourceTitle":"Source","content":"ref","chunkIndex":0,"similarity":0.9}]`,
      `__TOOL_CALL:{"tool":"web_search","query":"test","status":"done","resultCount":3}`,
      `__GROUNDING:{"passed":true,"issues":[],"message":"Grounded"}`,
      `__FOLLOWUPS:["What about X?"]`,
      "__DONE",
    ]);
    const callbacks = createMockCallbacks();

    await consumePersistentTextStream(response, callbacks);

    expect(callbacks.calls.onComplete).toHaveLength(1);
    expect(callbacks.calls.onToken.length).toBeGreaterThan(0);
    expect(callbacks.calls.onReferences.length).toBeGreaterThan(0);
    expect(callbacks.calls.onStatus.length).toBeGreaterThan(0);
    expect(callbacks.calls.onToolCalls.length).toBeGreaterThan(0);
    expect(callbacks.calls.onGroundingChecks.length).toBeGreaterThan(0);
    expect(callbacks.calls.onFollowUps.length).toBeGreaterThan(0);
  });
});
