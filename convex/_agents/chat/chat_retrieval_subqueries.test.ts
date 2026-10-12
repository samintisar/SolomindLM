import { describe, expect, it } from "vitest";
import {
  parseRetrievalSubqueriesFromLlmContent,
  trivialRetrievalSubqueryMessage,
} from "./chat_retrieval_subqueries";

describe("trivialRetrievalSubqueryMessage", () => {
  it("keeps short single-intent questions on the fast path", () => {
    expect(trivialRetrievalSubqueryMessage("What is retrieval-augmented generation?")).toBe(true);
    expect(trivialRetrievalSubqueryMessage("How does the retriever pick passages?")).toBe(true);
  });

  // #347: these span several sources and need one search per source.
  it.each([
    "How does Self-RAG's approach to deciding when to retrieve differ from the original RAG model?",
    "How does each paper's method perform on MMLU compared with GPT-4o?",
    "What do both studies conclude about sample size?",
    "Where do the two reports differ on inflation?",
  ])("decomposes cross-source question: %s", (q) => {
    expect(trivialRetrievalSubqueryMessage(q)).toBe(false);
  });
});

// #450: the planner says whether the question is about each selected source.
describe("parseRetrievalSubqueriesFromLlmContent", () => {
  it("reads the planner's per-source flag", () => {
    expect(
      parseRetrievalSubqueriesFromLlmContent(
        '{"subqueries": ["limitations of the study"], "aboutEachSource": true}'
      )
    ).toEqual({ subqueries: ["limitations of the study"], aboutEachSource: true });
  });

  it("treats a missing flag as a topic question", () => {
    expect(
      parseRetrievalSubqueriesFromLlmContent('{"subqueries": ["retrieval augmented generation"]}')
        ?.aboutEachSource
    ).toBe(false);
  });
});
