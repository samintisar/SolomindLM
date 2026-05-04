/**
 * Vision-based LLM judge for infographic evaluation.
 *
 * Uses Qwen/Qwen3.5-9B (a vision-capable model on Together AI) to evaluate
 * the generated infographic image for quality, visual appeal, and content accuracy.
 */

import Together from "together-ai";
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";

// ============================================================
// Configuration
// ============================================================

const VISION_JUDGE_MODEL = "Qwen/Qwen3-VL-8B-Instruct";

export interface VisionJudgeConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

function createVisionClient(config: VisionJudgeConfig = {}): Together {
  const apiKey = config.apiKey ?? process.env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TOGETHER_AI_API_KEY not found. Set it in environment or pass via config.apiKey"
    );
  }

  return new Together({
    apiKey,
    baseURL: config.baseURL ?? "https://api.together.xyz/v1",
  });
}

// ============================================================
// Vision Judge Prompts
// ============================================================

const INFOGRAPHIC_QUALITY_PROMPT = `You are an expert graphic designer and data visualization specialist. Evaluate this infographic image based on the following criteria:

1. **Visual Quality** (0-1): Is the image clear, well-composed, and visually appealing? Are colors harmonious? Is typography readable?
2. **Content Accuracy** (0-1): Does the infographic accurately represent the requested topic? Are the key concepts clearly communicated?
3. **Style Adherence** (0-1): Does it match the requested visual style (if specified)?
4. **Information Density** (0-1): Is the infographic appropriately detailed? Not too sparse, not too cluttered?
5. **Overall** (0-1): Would this infographic effectively communicate its topic to the intended audience?

Respond in JSON:
{
  "visual_quality": { "score": 0.0, "reasoning": "..." },
  "content_accuracy": { "score": 0.0, "reasoning": "..." },
  "style_adherence": { "score": 0.0, "reasoning": "..." },
  "information_density": { "score": 0.0, "reasoning": "..." },
  "overall": { "score": 0.0, "reasoning": "..." }
}`;

// ============================================================
// Vision Judge Implementation
// ============================================================

export interface VisionJudgeResult {
  visual_quality: { score: number; reasoning: string };
  content_accuracy: { score: number; reasoning: string };
  style_adherence: { score: number; reasoning: string };
  information_density: { score: number; reasoning: string };
  overall: { score: number; reasoning: string };
}

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: "pass" | "warn" | "fail" | "info",
  score: number,
  detail: string
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
  };
}

/**
 * Evaluate an infographic using a vision-capable LLM.
 * The image URL is extracted from the artifact's studio output.
 */
export async function evaluateInfographicWithVision(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  config: VisionJudgeConfig = {}
): Promise<MetricResult[]> {
  const client = createVisionClient(config);
  const model = config.model ?? VISION_JUDGE_MODEL;

  // Extract image URL from the artifact
  const raw = artifact.studioOutput?.raw as
    | { data?: { imageUrl?: string }; title?: string }
    | undefined;
  const imageUrl = raw?.data?.imageUrl;

  if (!imageUrl) {
    return [
      baseMetric(
        "vision_judge",
        fixture,
        artifact,
        "fail",
        0,
        "No image URL found in infographic output — cannot perform vision evaluation."
      ),
    ];
  }

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert graphic designer and data visualization specialist. Evaluate infographic images. Respond only with valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Evaluate this infographic about: "${fixture.question}"\n\n${INFOGRAPHIC_QUALITY_PROMPT}`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    });

    let content = response.choices[0]?.message?.content ?? "{}";
    
    // Try to extract JSON if wrapped in markdown or has extra text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
    
    // Handle truncated JSON by trying to close it
    if (!content.trim().endsWith("}")) {
      const lastBrace = content.lastIndexOf("}");
      if (lastBrace > 0) {
        content = content.substring(0, lastBrace + 1);
      }
    }
    
    let result: VisionJudgeResult;
    try {
      result = JSON.parse(content) as VisionJudgeResult;
    } catch (_parseErr) {
      // Metric could not be computed — return fail with score 0 to avoid polluting aggregates
      return [
        baseMetric(
          "vision_judge",
          fixture,
          artifact,
          "fail",
          0,
          `Vision judge returned non-JSON response — metric not computed. Raw: ${content.slice(0, 200)}`
        ),
      ];
    }

    const metrics: MetricResult[] = [];

    // Overall score
    const overallScore = result.overall?.score ?? 0;
    const overallStatus =
      overallScore >= 0.7 ? "pass" : overallScore >= 0.4 ? "warn" : "fail";

    metrics.push(
      baseMetric(
        "vision_judge_overall",
        fixture,
        artifact,
        overallStatus,
        overallScore,
        result.overall?.reasoning ?? "No reasoning provided."
      )
    );

    // Individual dimension scores
    const dimensions: Array<keyof VisionJudgeResult> = [
      "visual_quality",
      "content_accuracy",
      "style_adherence",
      "information_density",
    ];

    for (const dim of dimensions) {
      const dimResult = result[dim];
      if (dimResult) {
        const score = dimResult.score ?? 0;
        const status =
          score >= 0.7 ? "pass" : score >= 0.4 ? "warn" : "fail";
        metrics.push(
          baseMetric(
            `vision_judge_${dim}`,
            fixture,
            artifact,
            status,
            score,
            dimResult.reasoning ?? "No reasoning provided."
          )
        );
      }
    }

    return metrics;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      baseMetric(
        "vision_judge",
        fixture,
        artifact,
        "fail",
        0,
        `Vision judge failed: ${message}`
      ),
    ];
  }
}
