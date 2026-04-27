import { describe, it, expect } from "vitest";
import { parseStreamBody } from "./chatApi";

// @vitest-environment node

describe("parseStreamBody", () => {
  it("parses plain text content", () => {
    const result = parseStreamBody("Hello world\nHow are you?");
    expect(result.text).toBe("Hello world\nHow are you?");
    expect(result.isDone).toBe(false);
  });

  it("parses __DONE marker", () => {
    const result = parseStreamBody("text\n__DONE");
    expect(result.text).toBe("text");
    expect(result.isDone).toBe(true);
  });

  it("parses __REFERENCES with valid JSON", () => {
    const refs = [{ documentId: "doc1", text: "chunk", score: 0.9 }];
    const result = parseStreamBody(`__REFERENCES:${JSON.stringify(refs)}`);
    expect(result.references).toEqual(refs);
  });

  it("ignores __REFERENCES with invalid JSON", () => {
    const result = parseStreamBody("__REFERENCES:not-json");
    expect(result.references).toBeUndefined();
  });

  it("parses __STATUS marker", () => {
    const result = parseStreamBody("__STATUS:thinking:Analyzing your question...");
    expect(result.status).toEqual({
      status: "thinking",
      message: "Analyzing your question...",
    });
  });

  it("ignores __STATUS without colon separator", () => {
    const result = parseStreamBody("__STATUS:nocolon");
    expect(result.status).toBeUndefined();
  });

  it("parses __ERROR marker", () => {
    const result = parseStreamBody('__ERROR:{"message":"Rate limited","type":"rate_limit"}');
    expect(result.error).toEqual({ message: "Rate limited", type: "rate_limit" });
  });

  it("parses __FOLLOWUPS marker", () => {
    const questions = ["What about X?", "Can you explain Y?"];
    const result = parseStreamBody(`__FOLLOWUPS:${JSON.stringify(questions)}`);
    expect(result.followUps).toEqual(questions);
  });

  it("parses __CLARIFICATION marker", () => {
    const result = parseStreamBody('__CLARIFICATION:{"question":"Which topic?"}');
    expect(result.clarification).toEqual({ question: "Which topic?" });
  });

  it("parses __RESEARCH_PLAN marker", () => {
    const plan = { planId: "p1", subQuestions: ["q1", "q2"], sourcePolicy: { channels: ["web"] } };
    const result = parseStreamBody(`__RESEARCH_PLAN:${JSON.stringify(plan)}`);
    expect(result.researchPlan).toEqual(plan);
  });

  it("parses __RESEARCH_PROGRESS marker", () => {
    const progress = { phase: "searching", subQuestionId: "sq1", sourcesFound: 5 };
    const result = parseStreamBody(`__RESEARCH_PROGRESS:${JSON.stringify(progress)}`);
    expect(result.researchProgress).toEqual(progress);
  });

  it("parses __EXTERNAL_SOURCES marker", () => {
    const sources = [{ title: "Paper", url: "https://example.com", snippet: "abc", sourceType: "web", score: 0.8 }];
    const result = parseStreamBody(`__EXTERNAL_SOURCES:${JSON.stringify(sources)}`);
    expect(result.externalSources).toEqual(sources);
  });

  it("trims trailing newline from text", () => {
    const result = parseStreamBody("Hello\n");
    expect(result.text).toBe("Hello");
  });

  it("handles empty body", () => {
    const result = parseStreamBody("");
    expect(result.text).toBe("");
    expect(result.isDone).toBe(false);
  });
});

describe("parseStreamBody — __TOOL_CALL merging", () => {
  it("parses a single __TOOL_CALL with searching status", () => {
    const toolCall = { tool: "web_search", query: "test", status: "searching" };
    const result = parseStreamBody(`__TOOL_CALL:${JSON.stringify(toolCall)}`);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual(toolCall);
  });

  it("merges tool call updates by key", () => {
    const searching = { tool: "web_search", query: "test", status: "searching" };
    const done = { tool: "web_search", query: "test", status: "done", resultCount: 5 };
    const result = parseStreamBody(
      `__TOOL_CALL:${JSON.stringify(searching)}\n__TOOL_CALL:${JSON.stringify(done)}`
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].status).toBe("done");
    expect(result.toolCalls![0].resultCount).toBe(5);
  });

  it("tracks multiple different tools separately", () => {
    const tool1 = { tool: "web_search", query: "a", status: "searching" };
    const tool2 = { tool: "academic_search", query: "b", status: "searching" };
    const result = parseStreamBody(
      `__TOOL_CALL:${JSON.stringify(tool1)}\n__TOOL_CALL:${JSON.stringify(tool2)}`
    );
    expect(result.toolCalls).toHaveLength(2);
  });

  it("sets toolCall to last entry (backward compat)", () => {
    const tool1 = { tool: "web_search", query: "a", status: "done" };
    const tool2 = { tool: "academic_search", query: "b", status: "done" };
    const result = parseStreamBody(
      `__TOOL_CALL:${JSON.stringify(tool1)}\n__TOOL_CALL:${JSON.stringify(tool2)}`
    );
    expect(result.toolCall!.tool).toBe("academic_search");
  });

  it("ignores malformed __TOOL_CALL JSON", () => {
    const result = parseStreamBody("__TOOL_CALL:not-json");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("ignores __TOOL_CALL without valid status", () => {
    const bad = { tool: "web_search", query: "test", status: "invalid" };
    const result = parseStreamBody(`__TOOL_CALL:${JSON.stringify(bad)}`);
    expect(result.toolCalls).toHaveLength(0);
  });
});

describe("parseStreamBody — __GROUNDING parsing", () => {
  it("parses __GROUNDING marker", () => {
    const check = { passed: true, issues: [], message: "All good" };
    const result = parseStreamBody(`__GROUNDING:${JSON.stringify(check)}`);
    expect(result.groundingChecks).toHaveLength(1);
    expect(result.groundingChecks![0].passed).toBe(true);
    expect(result.groundingChecks![0].soft).toBe(false);
  });

  it("parses __GROUNDING_WARN with soft=true", () => {
    const check = { passed: false, issues: ["weak"], message: "Weak answer" };
    const result = parseStreamBody(`__GROUNDING_WARN:${JSON.stringify(check)}`);
    expect(result.groundingChecks).toHaveLength(1);
    expect(result.groundingChecks![0].soft).toBe(true);
  });

  it("sets groundingCheck to last entry (backward compat)", () => {
    const check1 = { passed: true, issues: [], message: "First" };
    const check2 = { passed: false, issues: ["x"], message: "Second" };
    const result = parseStreamBody(
      `__GROUNDING:${JSON.stringify(check1)}\n__GROUNDING:${JSON.stringify(check2)}`
    );
    expect(result.groundingCheck!.message).toBe("Second");
  });

  it("ignores malformed grounding JSON", () => {
    const result = parseStreamBody("__GROUNDING:not-json");
    expect(result.groundingChecks).toHaveLength(0);
  });

  it("ignores grounding without required fields", () => {
    const bad = { passed: true }; // missing issues and message
    const result = parseStreamBody(`__GROUNDING:${JSON.stringify(bad)}`);
    expect(result.groundingChecks).toHaveLength(0);
  });
});

describe("parseStreamBody — combined stream", () => {
  it("parses a full realistic stream", () => {
    const body = [
      "__STATUS:thinking:Processing...",
      "Here is the answer.",
      "",
      "Some more text [1].",
      `__REFERENCES:[{"documentId":"d1","text":"ref","score":0.9}]`,
      `__TOOL_CALL:{"tool":"web_search","query":"test","status":"done","resultCount":3}`,
      `__GROUNDING:{"passed":true,"issues":[],"message":"Grounded"}`,
      "__DONE",
    ].join("\n");

    const result = parseStreamBody(body);

    expect(result.text).toBe("Here is the answer.\n\nSome more text [1].");
    expect(result.isDone).toBe(true);
    expect(result.status).toEqual({ status: "thinking", message: "Processing..." });
    expect(result.references).toHaveLength(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.groundingChecks).toHaveLength(1);
  });
});
