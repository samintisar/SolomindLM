import { describe, expect, it } from "vitest";
import {
  expandListSubqueries,
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

describe("subquery cap (maxSubqueries)", () => {
  const six = '{"subqueries": ["a one", "b two", "c three", "d four", "e five", "f six"]}';

  it("keeps all six by default", () => {
    expect(parseRetrievalSubqueriesFromLlmContent(six)?.subqueries).toHaveLength(6);
  });

  it("keeps the first N when the cap is lower", () => {
    expect(parseRetrievalSubqueriesFromLlmContent(six, 2)?.subqueries).toEqual(["a one", "b two"]);
  });
});

describe("expandListSubqueries cap (maxSubqueries)", () => {
  it("pads a list query up to the cap, and no further", () => {
    expect(expandListSubqueries("list the 20 agentic patterns", ["x"], 3)).toHaveLength(3);
  });

  it("keeps the default of six when no cap is given", () => {
    expect(expandListSubqueries("list the 20 agentic patterns", ["x"])).toHaveLength(6);
  });
});
