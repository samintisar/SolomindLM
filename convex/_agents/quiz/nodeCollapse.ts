"use node";

import { clearStateKeys } from "../_shared/index.js";
import type { JobLogger } from "../_shared/logging.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { GRAPH_CONFIG } from "./config.js";
import { heuristicDedupe } from "./quizHeuristics.js";
import { callStatusUpdate } from "./nodeSplit.js";
import type { QuizCandidate } from "./prompts.js";
import type { OverallStateType } from "./state.js";

export interface CollapseNodeDeps {
  estimateTokens: (text: string) => number;
}

async function collapseGroup(group: string[], logger: JobLogger): Promise<string> {
  // Flatten all question arrays
  const allQuestions: QuizCandidate[] = [];
  for (const output of group) {
    try {
      const parsed = JSON.parse(output) as QuizCandidate[];
      allQuestions.push(...parsed);
    } catch (e) {
      logger.warn("Failed to parse question array in collapseGroup", {
        agent: "QuizGraph",
        phase: "collapse_group_parse_error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Use heuristic deduplication to reduce tokens
  // This is much faster than LLM and works well for quiz questions
  const uniqueQuestions = heuristicDedupe(allQuestions);

  return JSON.stringify(uniqueQuestions);
}

async function recursiveCollapse(
  outputs: string[],
  estimateTokens: (text: string) => number,
  logger: JobLogger,
  depth: number = 0
): Promise<string[]> {
  if (depth >= GRAPH_CONFIG.MAX_COLLAPSE_DEPTH) {
    logger.warn(
      `Max collapse depth (${GRAPH_CONFIG.MAX_COLLAPSE_DEPTH}) reached, returning current outputs`,
      {
        agent: "QuizGraph",
        phase: "recursive_collapse",
        depth,
        maxDepth: GRAPH_CONFIG.MAX_COLLAPSE_DEPTH,
        outputCount: outputs.length,
      }
    );
    return outputs;
  }

  const totalTokens = outputs.reduce((sum, s) => sum + estimateTokens(s), 0);

  if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    return outputs;
  }

  const targetGroupTokens = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS * 0.8;
  const collapsed: string[] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of outputs) {
    const tokens = estimateTokens(output);
    if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
      collapsed.push(await collapseGroup(currentGroup, logger));
      currentGroup = [output];
      currentTokens = tokens;
    } else {
      currentGroup.push(output);
      currentTokens += tokens;
    }
  }

  if (currentGroup.length > 0) {
    collapsed.push(await collapseGroup(currentGroup, logger));
  }

  return recursiveCollapse(collapsed, estimateTokens, logger, depth + 1);
}

export async function collapse(
  state: OverallStateType,
  deps: CollapseNodeDeps
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("QuizGraph", "quiz");
  console.log(`\n${"=".repeat(80)}`);
  console.log("[QuizGraph] ===== COLLAPSE PHASE =====");
  console.log("=".repeat(80));

  const mapOutputsDetails = state.mapOutputs.map((output, idx) => {
    let candidates: number;
    try {
      const parsed = JSON.parse(output) as QuizCandidate[];
      candidates = parsed.length;
    } catch {
      candidates = 0;
    }
    return {
      index: idx,
      tokens: deps.estimateTokens(output),
      candidates,
      preview: output.substring(0, 100).replace(/\n/g, " "),
    };
  });

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "collapse",
        mapOutputsReceived: state.mapOutputs.length,
        mapOutputsDetails,
      },
      null,
      2
    )
  );

  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    logger.phaseError("collapse", new Error("No mapOutputs received"), {
      agent: "QuizGraph",
    });
    await callStatusUpdate(state, "collapsing");
    return {
      ...state,
      collapsedOutputs: [],
      status: "reducing",
    };
  }

  const totalTokens = state.mapOutputs.reduce((sum, s) => sum + deps.estimateTokens(s), 0);

  logger.info(
    `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`,
    {
      agent: "QuizGraph",
      phase: "collapse",
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    }
  );

  await callStatusUpdate(state, "collapsing");

  if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    logger.info("Collapse: skipping recursive collapse, using mapOutputs directly", {
      agent: "QuizGraph",
      phase: "collapse_skip",
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    });

    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    logger.info(`Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`, {
      agent: "QuizGraph",
      phase: "collapse_cleanup",
      memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
    });

    return {
      ...state,
      collapsedOutputs: state.mapOutputs,
      status: "reducing",
      ...clearStateKeys<OverallStateType>(["mapOutputs"]),
      progress: {
        phase: "collapse",
        percentage: 70,
        message: `Collected ${state.mapOutputs.length} chunk outputs`,
      },
    };
  }

  logger.info("Collapse: performing recursive collapse", {
    agent: "QuizGraph",
    phase: "collapse_recursive",
    totalTokens,
    reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
  });
  const collapsed = await recursiveCollapse(state.mapOutputs, deps.estimateTokens, logger);

  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  logger.info(`Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`, {
    agent: "QuizGraph",
    phase: "collapse_cleanup",
    memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
  });

  return {
    ...state,
    collapsedOutputs: collapsed,
    status: "reducing",
    ...clearStateKeys<OverallStateType>(["mapOutputs"]),
    progress: {
      phase: "collapse",
      percentage: 70,
      message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
    },
  };
}
