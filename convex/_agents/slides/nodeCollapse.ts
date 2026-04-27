"use node";

import { clearStateKeys, withoutMapOutputs } from "../_shared/index.js";
import type { JobLogger } from "../_shared/logging.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { GRAPH_CONFIG } from "./config.js";
import type { SlideCandidate } from "./prompts.js";
import { callStatusUpdate } from "./nodeSplit.js";
import type { OverallStateType } from "./state.js";

export interface CollapseNodeDeps {
  estimateTokens: (text: string) => number;
}

async function collapseGroup(group: string[], logger: JobLogger): Promise<string> {
  const allSlides: SlideCandidate[] = [];
  for (const output of group) {
    try {
      const parsed = JSON.parse(output) as SlideCandidate[];
      allSlides.push(...parsed);
    } catch (e) {
      logger.warn("Failed to parse slide array in collapseGroup", {
        agent: "SlideDeckGraph",
        phase: "collapse_group_parse_error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const seen = new Set<string>();
  const uniqueSlides = allSlides.filter((slide) => {
    const key = slide.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(`Collapsed ${allSlides.length} → ${uniqueSlides.length} unique slides`, {
    agent: "SlideDeckGraph",
    phase: "collapse_group",
    inputSlides: allSlides.length,
    uniqueSlides: uniqueSlides.length,
  });

  return JSON.stringify(uniqueSlides);
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
        agent: "SlideDeckGraph",
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
  const logger = createAgentGraphLogger("SlideDeckGraph", "slides");
  console.log(`\n${"=".repeat(80)}`);
  console.log("[SlideDeckGraph] ===== COLLAPSE PHASE =====");
  console.log("=".repeat(80));

  const mapOutputsDetails = state.mapOutputs.map((output, idx) => {
    let slides: number;
    try {
      const parsed = JSON.parse(output) as SlideCandidate[];
      slides = parsed.length;
    } catch {
      slides = 0;
    }
    return {
      index: idx,
      tokens: deps.estimateTokens(output),
      slides,
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
      agent: "SlideDeckGraph",
    });
    await callStatusUpdate(state, "collapsing");
    return {
      collapsedOutputs: [],
      status: "reducing",
    };
  }

  const totalTokens = state.mapOutputs.reduce((sum, s) => sum + deps.estimateTokens(s), 0);

  logger.info(
    `Total tokens: ${totalTokens}, Reduce chunk size: ${GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS} tokens`,
    {
      agent: "SlideDeckGraph",
      phase: "collapse",
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    }
  );

  await callStatusUpdate(state, "collapsing");

  if (totalTokens <= GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS) {
    logger.info("Collapse: skipping recursive collapse, using mapOutputs directly", {
      agent: "SlideDeckGraph",
      phase: "collapse_skip",
      totalTokens,
      reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
    });

    const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
    logger.info(`Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`, {
      agent: "SlideDeckGraph",
      phase: "collapse_cleanup",
      memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
    });

    return {
      ...withoutMapOutputs(state),
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
    agent: "SlideDeckGraph",
    phase: "collapse_recursive",
    totalTokens,
    reduceChunkSize: GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS,
  });
  const collapsed = await recursiveCollapse(state.mapOutputs, deps.estimateTokens, logger);

  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  logger.info(`Freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`, {
    agent: "SlideDeckGraph",
    phase: "collapse_cleanup",
    memoryFreedKB: (mapOutputsSize / 1024).toFixed(2),
  });

  return {
    ...withoutMapOutputs(state),
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
