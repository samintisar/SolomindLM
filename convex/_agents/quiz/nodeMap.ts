"use node";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  createLangSmithRunConfig,
  invokeWithRetry,
  invokeWithTimeout,
  sanitizeUserInput,
} from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";

import { GRAPH_CONFIG } from "./config.js";
import {
  getCandidateMapPrompt,
  MAP_CANDIDATES_SYSTEM_PROMPT,
  type QuizCandidateResponse,
} from "./prompts.js";
import type { ChunkProcessState, OverallStateType } from "./state.js";
import type { StructuredOutputInvoker } from "./structuredLlm.js";

export interface MapProcessDeps {
  fastLlmCandidateStructured: StructuredOutputInvoker<QuizCandidateResponse>;
  estimateTokens: (text: string) => number;
}

export async function mapProcess(
  state: ChunkProcessState,
  deps: MapProcessDeps
): Promise<Partial<OverallStateType>> {
  const { chunk, chunkIndex, questionCount, difficulty, focus, questionsPerChunk } = state;
  const startTime = Date.now();

  const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : "[Chunk ?]";

  const logger = createAgentGraphLogger("QuizGraph", "quiz");

  logger.phaseStart("map_process", {
    agent: "QuizGraph",
    chunkIndex,
    chunkTokens: deps.estimateTokens(chunk),
    chunkPreview: chunk.substring(0, 150).replace(/\n/g, " "),
    targetQuestionCount: questionCount,
    questionsPerChunkTarget: questionsPerChunk,
    difficulty,
    focus: focus || "none",
  });

  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;
  const prompt = getCandidateMapPrompt({
    chunk,
    questionCount,
    questionsPerChunk,
    difficulty,
    focus: sanitizedFocus,
  });

  logger.info(`Sending prompt to LLM (~${deps.estimateTokens(prompt)} tokens)...`, {
    agent: "QuizGraph",
    phase: "map_process",
    chunkId,
    promptTokens: deps.estimateTokens(prompt),
  });

  let output: string;
  let candidatesGenerated: number;

  try {
    const response: QuizCandidateResponse = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            (deps.fastLlmCandidateStructured as any).invoke(
              [new SystemMessage(MAP_CANDIDATES_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: "QuizGraph.MapCandidates",
                tags: ["agent", "quiz", "map"],
                metadata: {
                  chunkIndex,
                  questionCount,
                  difficulty,
                  focus: focus || "none",
                },
              })
            ),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          "QuizMap"
        ),
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn(`Retry attempt ${attempt}/3`, {
            agent: "QuizGraph",
            phase: "map_process",
            chunkIndex,
            attempt,
            error: error.message,
          });
        },
      },
      "QuizMap"
    );

    candidatesGenerated = response.questions.length;
    output = JSON.stringify(response.questions);
  } catch (error) {
    logger.phaseError("map_process", error instanceof Error ? error : new Error(String(error)), {
      agent: "QuizGraph",
      chunkIndex,
      chunkLength: chunk.length,
      difficulty,
    });

    output = "[]";
    candidatesGenerated = 0;
  }

  const elapsed = Date.now() - startTime;

  logger.phaseComplete("map_process", {
    agent: "QuizGraph",
    chunkIndex,
    outputTokens: deps.estimateTokens(output),
    questionsGenerated: candidatesGenerated,
    processingTimeMs: elapsed,
    outputPreview: output.substring(0, 200).replace(/\n/g, " "),
  });

  return {
    mapOutputs: [output],
    progress: {
      phase: "map_process",
      percentage: Math.min(10 + (chunkIndex ?? 0) * 30, 60),
      message: `Chunk ${(chunkIndex ?? 0) + 1} complete: ${candidatesGenerated} candidates`,
      chunksCompleted: (chunkIndex ?? 0) + 1,
    },
  };
}
