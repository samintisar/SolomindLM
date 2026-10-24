"use node";

// #558: deep research evidence keeps paper metadata, drops off-topic papers, never stores a
// landing-page scrape, and gives the user's notebook a fair share of the writer's evidence.
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredResearchSource, ResearchNodeDeps } from "./nodes";
import {
  dropOffTopicPapers,
  packEvidenceForWriter,
  rememberTopicVerdicts,
  retrieverNode,
  withNotebookChannel,
} from "./nodes";
import type { ResearchStateType } from "./state";
import type { EvidenceEntry } from "./types";

function academicState(): ResearchStateType {
  return {
    query: "How well do spaced repetition lab findings hold up in classrooms?",
    subQuestions: [
      {
        id: "sq1",
        question: "What spacing gaps work best?",
        searchQueries: ["spacing effect retention interval"],
        sourceChannels: ["academic"],
        status: "pending",
      },
    ],
    sourcePolicy: { channels: ["academic"], maxResultsPerChannel: 5 },
    evidence: [],
    gaps: [],
    iteration: 0,
    maxIterations: 2,
    conversationHistory: [],
    documentIds: undefined,
    notebookId: "",
    userId: "",
    shouldStop: false,
    stopReason: "",
    finalResponse: "",
  };
}

const spacingPaper: DiscoveredResearchSource = {
  title: "Distributed practice in verbal recall tasks",
  url: "https://doi.org/10.1037/0033-2909.132.3.354",
  snippet: "Short snippet.",
  rawContent: "The full abstract of the review of spacing effects in verbal recall.",
  sourceType: "openalex",
  score: 0.9,
  metadata: {
    authors: ["Nicholas J. Cepeda", "Harold Pashler"],
    year: 2006,
    doi: "10.1037/0033-2909.132.3.354",
    sourceApi: "openalex",
  },
};

const loggingPaper: DiscoveredResearchSource = {
  title: "Cost-Aware Logging: Log Retention Policies",
  url: "https://example.org/logging",
  snippet: "How long to keep server logs.",
  sourceType: "arxiv",
  score: 0.8,
  metadata: { authors: ["A. Ops"], year: 2024, sourceApi: "arxiv" },
};

function academicDeps(overrides: Partial<ResearchNodeDeps> = {}): ResearchNodeDeps {
  return {
    apiKey: "test",
    smartModel: "test-model",
    runHybridSearch: async () => [],
    discoverSources: async () => [spacingPaper, loggingPaper],
    onProgress: async () => {},
    ...overrides,
  };
}

describe("retrieval queries", () => {
  it("searches the notebook with the sub-question first, then the keyword query", async () => {
    const runHybridSearch = vi.fn(async () => []);
    const state = academicState();
    state.subQuestions[0]!.sourceChannels = ["notebook"];
    await retrieverNode(state, academicDeps({ runHybridSearch }));
    expect(runHybridSearch.mock.calls).toEqual([
      ["What spacing gaps work best?", undefined],
      ["spacing effect retention interval", undefined],
    ]);
  });

  it("skips the notebook on a gap pass, which would get the same chunks", async () => {
    const runHybridSearch = vi.fn(async () => []);
    const state = { ...academicState(), iteration: 1 };
    state.subQuestions[0]!.sourceChannels = ["notebook"];
    await retrieverNode(state, academicDeps({ runHybridSearch }));
    expect(runHybridSearch).not.toHaveBeenCalled();
  });

  it("asks for a wider paper pool when papers are screened, then keeps the cap", async () => {
    const papers = Array.from({ length: 12 }, (_, i) => ({
      ...spacingPaper,
      title: `Paper ${i}`,
      url: `https://example.org/${i}`,
      rawContent: `Abstract of paper ${i} on spacing.`,
    }));
    const discoverSources = vi.fn(async () => papers);
    const isPaperOnTopic = vi.fn(
      async (paper: { title: string }) => Number(paper.title.split(" ")[1]) % 2 === 0
    );
    const result = await retrieverNode(
      academicState(),
      academicDeps({ discoverSources, isPaperOnTopic })
    );
    expect(discoverSources).toHaveBeenCalledWith(expect.any(String), ["academic"], 12);
    // Screened in batches of the cap (5): two batches keep 5 papers, so the last 2 are never screened.
    expect(isPaperOnTopic).toHaveBeenCalledTimes(10);
    expect(result.evidence!.map((e) => e.sourceTitle)).toEqual([
      "Paper 0",
      "Paper 2",
      "Paper 4",
      "Paper 6",
      "Paper 8",
    ]);
  });
});

describe("academic retrieval", () => {
  it("carries authors, year and identifiers into the evidence", async () => {
    const result = await retrieverNode(academicState(), academicDeps());
    const entry = result.evidence!.find((e) => e.sourceTitle === spacingPaper.title)!;
    expect(entry.metadata).toMatchObject({
      authors: ["Nicholas J. Cepeda", "Harold Pashler"],
      year: 2006,
      doi: "10.1037/0033-2909.132.3.354",
      sourceApi: "openalex",
    });
    // The full abstract, not the 500-character snippet.
    expect(entry.content).toBe(spacingPaper.rawContent);
  });

  it("drops papers the screen calls off topic, against the user's question", async () => {
    const isPaperOnTopic = vi.fn(async (paper: { title: string }) => !paper.title.includes("Log"));
    const result = await retrieverNode(academicState(), academicDeps({ isPaperOnTopic }));
    expect(result.evidence!.map((e) => e.sourceTitle)).toEqual([spacingPaper.title]);
    expect(isPaperOnTopic).toHaveBeenCalledWith(
      expect.objectContaining({ abstract: spacingPaper.rawContent }),
      academicState().query
    );
  });
});

describe("dropOffTopicPapers", () => {
  it("keeps a paper when its screen fails", async () => {
    const kept = await dropOffTopicPapers([spacingPaper, loggingPaper], "q", async (paper) => {
      if (paper.title.includes("Log")) throw new Error("model down");
      return true;
    });
    expect(kept).toEqual([spacingPaper, loggingPaper]);
  });
});

describe("rememberTopicVerdicts", () => {
  it("screens a paper once per question and retries a failed screen", async () => {
    let calls = 0;
    const screen = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("model down");
      return true;
    });
    const paper = { title: "Distributed practice", abstract: "a" };
    await expect(rememberTopicVerdicts(screen)(paper, "q")).rejects.toThrow("model down");
    expect(await rememberTopicVerdicts(screen)(paper, "q")).toBe(true);
    expect(await rememberTopicVerdicts(screen)(paper, "q")).toBe(true);
    expect(screen).toHaveBeenCalledTimes(2);
  });
});

describe("evidence dedupe", () => {
  it("keeps different papers that have no abstract", async () => {
    const noAbstract = (title: string): DiscoveredResearchSource => ({
      title,
      url: `https://example.org/${title}`,
      snippet: "",
      sourceType: "semantic_scholar",
      score: 0.5,
    });
    const result = await retrieverNode(
      academicState(),
      academicDeps({ discoverSources: async () => [noAbstract("p1"), noAbstract("p2")] })
    );
    expect(result.evidence!.map((e) => e.sourceTitle)).toEqual(["p1", "p2"]);
  });
});

describe("withNotebookChannel", () => {
  it("adds the notebook to a sub-question when the channel is on", () => {
    expect(withNotebookChannel(["academic"], ["notebook", "academic"])).toEqual([
      "notebook",
      "academic",
    ]);
  });

  it("leaves channels alone when the notebook is off or already there", () => {
    expect(withNotebookChannel(["web"], ["web", "academic"])).toEqual(["web"]);
    expect(withNotebookChannel(["web", "notebook"], ["notebook", "web"])).toEqual([
      "web",
      "notebook",
    ]);
  });
});

function entry(
  sourceType: EvidenceEntry["sourceType"],
  title: string,
  score: number
): EvidenceEntry {
  return {
    subQuestionId: "sq1",
    sourceType,
    sourceTitle: title,
    content: title,
    relevanceScore: score,
    iteration: 0,
  };
}

describe("packEvidenceForWriter", () => {
  it("gives the notebook a share even when its scores are on a smaller scale", () => {
    const evidence = [
      entry("web", "w1", 0.9),
      entry("web", "w2", 0.85),
      entry("academic", "a1", 0.8),
      entry("academic", "a2", 0.7),
      entry("notebook", "n1", 0.03),
      entry("notebook", "n2", 0.02),
    ];
    const packed = packEvidenceForWriter(evidence, 4);
    expect(packed.sq1!.map((e) => e.sourceTitle)).toEqual(["n1", "a1", "w1", "n2"]);
  });

  it("fills the cap from the remaining channels when one runs out", () => {
    const evidence = [
      entry("notebook", "n1", 0.5),
      ...[1, 2, 3].map((i) => entry("web", `w${i}`, 1 - i / 10)),
    ];
    expect(packEvidenceForWriter(evidence, 3).sq1!.map((e) => e.sourceTitle)).toEqual([
      "n1",
      "w1",
      "w2",
    ]);
  });
});
