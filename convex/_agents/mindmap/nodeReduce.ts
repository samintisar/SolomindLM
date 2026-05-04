"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";

import {
  invokeWithTimeout,
  validateWithPreset,
  createLangSmithRunConfig,
} from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { GRAPH_CONFIG } from "./config.js";
import { createSmartFallback } from "./fallbacks.js";
import { parseMarkdownToTree } from "./parsing.js";
import { REDUCE_PROMPT, REDUCE_SYSTEM_PROMPT } from "./prompts.js";
import type { OverallStateType } from "./state.js";

const MAX_PERMANENT_MAP_FAILURES = 5;

export async function reduceNode(
  state: OverallStateType,
  smartLlm: ChatTogetherAI
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("MindMapGraph", "mindmap");
  const extractions = state.extractedConcepts || [];
  const failures = state.permanentMapFailures ?? 0;
  if (failures >= MAX_PERMANENT_MAP_FAILURES && extractions.length === 0) {
    const err = new Error(
      `Map phase circuit breaker: ${failures} chunk(s) failed permanently with no successful extractions (limit ${MAX_PERMANENT_MAP_FAILURES})`
    );
    logger.phaseError("reduce", err, { agent: "MindMapGraph", permanentMapFailures: failures });
    throw err;
  }
  if (failures >= MAX_PERMANENT_MAP_FAILURES && extractions.length > 0) {
    logger.warn(
      `High map failure count (${failures}) but continuing with ${extractions.length} successful extraction(s)`,
      { agent: "MindMapGraph", phase: "reduce", permanentMapFailures: failures }
    );
  }

  logger.phaseStart("reduce", {
    agent: "MindMapGraph",
    extractionsCount: extractions.length,
  });

  if (extractions.length === 0) {
    logger.phaseError("reduce", new Error("No extractions to build from!"), {
      agent: "MindMapGraph",
    });
    return {
      finalOutput: { nodeData: { topic: "Error: No Content", children: null } },
      status: "failed",
      progress: {
        phase: "reduce",
        percentage: 100,
        message: "Failed: No content extracted",
      },
    };
  }

  const inputData = extractions
    .map(
      (e) => `THEME: ${e.main_theme}\nSUMMARY: ${e.summary}\nCONCEPTS: ${e.key_concepts.join(", ")}`
    )
    .join("\n\n---\n\n");

  const safeInput = inputData.slice(0, 150000);

  logger.info(`Reducing ${extractions.length} extractions into map (${safeInput.length} chars)`, {
    agent: "MindMapGraph",
    phase: "reduce",
    inputSize: inputData.length,
    truncatedSize: safeInput.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: (smartLlm as any).model,
  });

  try {
    const start = Date.now();
    const response = await invokeWithTimeout(
      () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (smartLlm as any).invoke(
          [
            new SystemMessage(REDUCE_SYSTEM_PROMPT),
            new HumanMessage(REDUCE_PROMPT.replace("{extractions}", safeInput)),
          ],
          createLangSmithRunConfig({
            runName: "MindMapGraph.Reduce",
            tags: ["agent", "mindmap", "reduce"],
            metadata: {
              extractionCount: extractions.length,
              inputSize: safeInput.length,
            },
          })
        ),
      GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
      "MindMapReduce"
    );

    const markdown =
      ((response as BaseMessage).content[0] as { text?: string })?.text ||
      String((response as BaseMessage).content);

    const validation = validateWithPreset(markdown, "mindmap");
    if (!validation.isValid) {
      logger.warn(`Mind map validation issues: ${validation.warnings.join(", ")}`, {
        agent: "MindMapGraph",
        phase: "reduce",
        validation: {
          isValid: validation.isValid,
          warnings: validation.warnings,
          score: validation.score,
        },
      });
    }

    const parsedTree = parseMarkdownToTree(markdown);
    const elapsed = Date.now() - start;

    logger.info(`Final map generated in ${elapsed}ms`, {
      agent: "MindMapGraph",
      phase: "reduce",
      markdownLength: markdown.length,
      processingTimeMs: elapsed,
      rootTopic: parsedTree.topic,
      branchCount: parsedTree.children?.length ?? 0,
    });

    if (parsedTree.children) {
      const branchTopics = parsedTree.children.map((c) => c.topic).join(", ");
      logger.info(`Branch topics: ${branchTopics}`, {
        agent: "MindMapGraph",
        phase: "reduce",
        branchTopics,
      });
    }

    logger.info("MIND MAP GENERATION COMPLETE", {
      agent: "MindMapGraph",
      phase: "generation_complete",
      rootTopic: parsedTree.topic,
      branchCount: parsedTree.children?.length ?? 0,
      processingTimeMs: elapsed,
      milestone: true,
    });

    return {
      finalOutput: { nodeData: parsedTree },
      status: "completed",
      progress: {
        phase: "reduce",
        percentage: 100,
        message: `Completed: Mind map "${parsedTree.topic}" with ${parsedTree.children?.length ?? 0} branches`,
        conceptsExtracted: extractions.length,
      },
    };
  } catch (e) {
    const _msg = e instanceof Error ? e.message : String(e);

    logger.phaseError("reduce", e instanceof Error ? e : new Error(String(e)), {
      agent: "MindMapGraph",
      error:
        e instanceof Error
          ? {
              name: e.name,
              message: e.message,
              stack: e.stack?.split("\n").slice(0, 3).join("\n"),
            }
          : String(e),
    });

    logger.info("Using smart fallback", {
      agent: "MindMapGraph",
      phase: "reduce_fallback",
    });

    const fallback = createSmartFallback(extractions);
    return {
      finalOutput: fallback,
      status: "completed",
      progress: {
        phase: "reduce",
        percentage: 100,
        message: `Completed: Mind map "${fallback.nodeData.topic}" (fallback mode)`,
        conceptsExtracted: extractions.length,
      },
    };
  }
}
