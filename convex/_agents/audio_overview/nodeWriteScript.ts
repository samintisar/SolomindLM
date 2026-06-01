"use node";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  invokeWithRetry,
  invokeWithTimeout,
  sanitizeUserInput,
  withoutMapOutputs,
} from "../_shared/index.js";
import { createAgentGraphLogger } from "../_shared/logging.js";
import { GRAPH_CONFIG } from "./config.js";
import {
  type AudioLength,
  type AudioType,
  buildCoveredTopicsPrompt,
  DIALOGUE_CHUNK_SIZE,
  ESTIMATED_WORDS_PER_LINE,
  EXAMPLE_EXTRACTION_SYSTEM_PROMPT,
  getReducePrompt,
  REDUCE_SYSTEM_PROMPT,
  TARGET_LINE_COUNTS,
} from "./prompts.js";
import type { DialogueLine, OverallStateType } from "./state.js";

/**
 * Generate dialogue script from collapsed outputs (reduce phase).
 */
export async function writeScript(
  state: OverallStateType,
  smartLlm: any
): Promise<Partial<OverallStateType>> {
  const logger = createAgentGraphLogger("AudioOverviewGraph", "audio");
  const { collapsedOutputs, audioType, length, focus } = state;
  const startTime = Date.now();

  logger.phaseStart("write_script", {
    agent: "AudioOverviewGraph",
    audioType,
    length,
    collapsedOutputsCount: collapsedOutputs.length,
    focus: focus || "none",
  });

  // Sanitize user input (focus)
  const sanitizedFocus = focus ? sanitizeUserInput(focus) : undefined;

  const combined = collapsedOutputs.join("\n\n---\n\n");
  const targetLines = TARGET_LINE_COUNTS[length as AudioLength] || TARGET_LINE_COUNTS.default;

  // Calculate number of chunks needed
  const numChunks = Math.ceil(targetLines / DIALOGUE_CHUNK_SIZE);

  logger.info(`Generating dialogue script (~${targetLines} lines in ${numChunks} chunks)`, {
    agent: "AudioOverviewGraph",
    phase: "write_script",
    promptLength: combined.length,
    targetLines,
    numChunks,
  });

  let fullDialogueScript: DialogueLine[] = [];

  // Track only examples to prevent repetition
  const coveredExamples = new Set<string>();

  try {
    // Generate dialogue in chunks to avoid token limits
    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      const linesThisChunk = Math.min(
        DIALOGUE_CHUNK_SIZE,
        targetLines - chunkIndex * DIALOGUE_CHUNK_SIZE
      );
      const _estimatedWordsThisChunk = linesThisChunk * ESTIMATED_WORDS_PER_LINE;

      // Build covered examples prompt for anti-repetition
      let coveredTopicsPrompt = "";
      if (chunkIndex > 0 && coveredExamples.size > 0) {
        coveredTopicsPrompt = buildCoveredTopicsPrompt(Array.from(coveredExamples));
      }

      // Build context from previous chunks for continuity
      const previousDialogue =
        chunkIndex > 0
          ? `\n\nRECENT DIALOGUE (for continuity only - continue naturally from here):\n${fullDialogueScript
              .slice(-4)
              .map((l) => `${l.speaker}: ${l.text}`)
              .join("\n")}\n`
          : "";

      const chunkPrompt = getReducePrompt({
        content: combined + previousDialogue,
        audioType: audioType as AudioType,
        length: length as AudioLength,
        focus: sanitizedFocus || "general overview",
        targetLines: linesThisChunk,
        coveredTopicsPrompt,
      });

      logger.info(`Generating chunk ${chunkIndex + 1}/${numChunks}`, {
        agent: "AudioOverviewGraph",
        phase: "write_script_chunk",
        chunkIndex: chunkIndex + 1,
        totalChunks: numChunks,
        targetLines: linesThisChunk,
      });

      // Timeout + Retry wrapper for resilient LLM calls
      const response = await invokeWithRetry(
        () =>
          invokeWithTimeout(
            () =>
              smartLlm.invoke([
                new SystemMessage(REDUCE_SYSTEM_PROMPT),
                new HumanMessage(chunkPrompt),
              ]),
            GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
            "AudioReduce"
          ),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          onRetry: (attempt, error) => {
            logger.warn(`Retry attempt ${attempt}/3`, {
              agent: "AudioOverviewGraph",
              phase: "write_script_chunk",
              chunkIndex: chunkIndex + 1,
              attempt,
              error: error.message,
            });
          },
        },
        "AudioReduce"
      );

      const responseText = String((response as { content: { toString: () => string } }).content);

      logger.info(`Received response (${responseText.length} chars)`, {
        agent: "AudioOverviewGraph",
        phase: "write_script_chunk",
        chunkIndex: chunkIndex + 1,
        responseLength: responseText.length,
      });

      // Robust JSON extraction
      const jsonStart = responseText.indexOf("[");
      const jsonEnd = responseText.lastIndexOf("]");

      if (jsonStart === -1 || jsonEnd === -1) {
        logger.warn("No JSON array found in response", {
          agent: "AudioOverviewGraph",
          phase: "write_script_chunk",
          chunkIndex: chunkIndex + 1,
          responsePreview: responseText.slice(0, 500),
        });
        continue;
      }

      const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);

      try {
        const chunkDialogue = JSON.parse(jsonStr) as DialogueLine[];

        // Validate structure
        if (
          !Array.isArray(chunkDialogue) ||
          chunkDialogue.length === 0 ||
          !chunkDialogue.every((line) => "speaker" in line && "text" in line)
        ) {
          throw new Error("Invalid dialogue script structure");
        }

        logger.info(`Successfully parsed ${chunkDialogue.length} lines`, {
          agent: "AudioOverviewGraph",
          phase: "write_script_chunk",
          chunkIndex: chunkIndex + 1,
          linesGenerated: chunkDialogue.length,
        });

        fullDialogueScript = fullDialogueScript.concat(chunkDialogue);

        // Extract examples from this chunk using LLM
        try {
          const extractionPrompt = `Analyze this dialogue excerpt and extract ONLY concrete examples, analogies, or real-world applications mentioned.

Return a JSON array:
["example 1", "example 2", "example 3"]

Rules:
- Only extract UNIQUE examples/analogies (not common phrases like "the idea")
- Maximum 5 examples
- Examples are things like: "GPS navigation", "8-puzzle", "robot vacuum", "protein folding"
- Ignore general concepts and filler words

DIALOGUE:
${chunkDialogue.map((d) => `${d.speaker}: ${d.text}`).join("\n")}`;

          const extractionResponse = await smartLlm.invoke([
            new SystemMessage(EXAMPLE_EXTRACTION_SYSTEM_PROMPT),
            new HumanMessage(extractionPrompt),
          ]);

          const extractionText = extractionResponse.content.toString();
          const exJsonStart = extractionText.indexOf("[");
          const exJsonEnd = extractionText.lastIndexOf("]");

          if (exJsonStart !== -1 && exJsonEnd !== -1) {
            const extracted = JSON.parse(extractionText.substring(exJsonStart, exJsonEnd + 1));
            (extracted || []).forEach((e: string) => coveredExamples.add(e.trim()));
          }
        } catch (_extractionError) {
          // Silently fail - example extraction is optional
        }
      } catch (parseError) {
        logger.warn("JSON parsing failed for chunk", {
          agent: "AudioOverviewGraph",
          phase: "write_script_chunk",
          chunkIndex: chunkIndex + 1,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          jsonPreview: jsonStr.slice(0, 500),
        });
      }
    }

    // If we got some dialogue but not enough, log a warning
    if (fullDialogueScript.length > 0 && fullDialogueScript.length < targetLines * 0.5) {
      logger.warn(
        `Generated fewer lines than target (${fullDialogueScript.length}/${targetLines})`,
        {
          agent: "AudioOverviewGraph",
          phase: "write_script",
          targetLines,
          actualLines: fullDialogueScript.length,
        }
      );
    }

    // If extraction completely failed, generate fallback
    if (fullDialogueScript.length === 0) {
      logger.warn("All chunks failed, using fallback script", {
        agent: "AudioOverviewGraph",
        phase: "write_script",
      });
      fullDialogueScript = [
        { speaker: "host_a", text: "I've analyzed the content you provided." },
        { speaker: "host_b", text: "What did you find most interesting?" },
        { speaker: "host_a", text: "There were several key points worth discussing." },
      ];
    }

    const elapsed = Date.now() - startTime;

    logger.phaseComplete("write_script", {
      agent: "AudioOverviewGraph",
      dialogueLines: fullDialogueScript.length,
      processingTimeMs: elapsed,
    });
  } catch (error) {
    logger.phaseError("write_script", error instanceof Error ? error : new Error(String(error)), {
      agent: "AudioOverviewGraph",
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 3).join("\n"),
            }
          : String(error),
    });

    fullDialogueScript = [
      { speaker: "host_a", text: "I apologize, but I had trouble processing this content." },
      { speaker: "host_b", text: "That sounds frustrating. What went wrong?" },
      {
        speaker: "host_a",
        text: "The system encountered an error. Please try again with different content.",
      },
    ];
  }

  return {
    ...withoutMapOutputs(state),
    dialogueScript: fullDialogueScript,
    status: "synthesizing",
    progress: {
      phase: "write_script",
      percentage: 60,
      message: `Generated ${fullDialogueScript.length} dialogue lines`,
      dialogueLines: fullDialogueScript.length,
    },
  };
}
