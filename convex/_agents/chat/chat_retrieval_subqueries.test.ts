import { describe, expect, it } from "vitest";
import { asksAboutEachSource, trivialRetrievalSubqueryMessage } from "./chat_retrieval_subqueries";

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

// #450: questions about every selected source get a search inside each source and an answer
// part per source; questions that only mention several things do not.
describe("asksAboutEachSource", () => {
  it.each([
    "What limitations does each paper acknowledge?",
    "How did each of my four papers measure physical activity?",
    "What do both studies conclude about sample size?",
    "Summarise all three sources",
    "Where do the two reports differ on inflation?",
    "Which methods do these papers use?",
    "Do the three articles agree on the dose?",
  ])("asks about each source: %s", (q) => {
    expect(asksAboutEachSource(q)).toBe(true);
  });

  it.each([
    "What is retrieval-augmented generation?",
    "Compare mitosis and meiosis",
    "Explain every step of glycolysis",
    "What does the paper say about dropout?",
    "According to the sources, when was the treaty signed?",
    "How does each layer of the network work?",
  ])("does not: %s", (q) => {
    expect(asksAboutEachSource(q)).toBe(false);
  });
});
