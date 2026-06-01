"use node";

import { createAgentGraphLogger } from "../_shared/logging.js";
import type { WrittenQuestion } from "./prompts.js";
import { PROBLEMATIC_PHRASES } from "./prompts.js";

export function validateSelfContained(question: WrittenQuestion): boolean {
  const logger = createAgentGraphLogger("WrittenQuestionsGraph", "written_questions");
  const text = question.question.toLowerCase();

  const foundPhrases = PROBLEMATIC_PHRASES.filter((phrase) => text.includes(phrase));
  if (foundPhrases.length === 0) return true;

  const hasEmbeddedContext =
    text.includes("as shown in") ||
    text.includes("given that") ||
    text.includes("in the following") ||
    text.includes("consider the") ||
    text.includes("based on") ||
    text.includes("according to") ||
    text.includes("described below") ||
    text.includes("the following") ||
    text.length > 200;

  const shouldReject = foundPhrases.length > 0 && !hasEmbeddedContext;

  if (shouldReject) {
    logger.warn("Question rejected: references external content without embedded context", {
      agent: "WrittenQuestionsGraph",
      phase: "validate_self_contained",
      questionPreview: question.question.substring(0, 100),
      questionLength: text.length,
      foundPhrases,
    });
  } else if (foundPhrases.length > 0 && hasEmbeddedContext) {
    logger.info("Question accepted: has problematic phrases but includes embedded context", {
      agent: "WrittenQuestionsGraph",
      phase: "validate_self_contained_accept",
      questionPreview: question.question.substring(0, 100),
      questionLength: text.length,
      foundPhrases,
    });
  }

  return !shouldReject;
}

export function extractTopic(question: WrittenQuestion): string {
  const text = question.question.toLowerCase();

  const patterns: Array<{ regex: RegExp; topic: string }> = [
    { regex: /\b(in|during|before|after)\s+\d+\b/i, topic: "Timeline/Dates" },
    { regex: /\bwhen\b.*\b(year|century|date|time|era|period)\b/i, topic: "Timeline/Dates" },
    {
      regex: /\bwho\b.*\b(invented|created|discovered|wrote|authored|developed)\b/i,
      topic: "People",
    },
    { regex: /\b(credited to|attributed to|pioneered by)\b/i, topic: "People" },
    { regex: /\bwhere\b.*\b(located|found|discovered|originated)\b/i, topic: "Places" },
    {
      regex: /\b(compare|contrast|differences?|similarities?|versus|vs\.?|relative to)\b/i,
      topic: "Comparisons",
    },
    {
      regex: /\b(process|method|procedure|step|algorithm|technique|approach)\b/i,
      topic: "Processes",
    },
    { regex: /\b(why|because|reason|cause|lead to|result in|factor)\b/i, topic: "Causes/Reasons" },
    {
      regex: /\b(define|definition|what is|what are|what does|meaning of)\b/i,
      topic: "Definitions",
    },
    { regex: /\b(which|select|choose|identify|classify|categorize)\b/i, topic: "Classification" },
    { regex: /\b(true|false|correct|incorrect|accurate)\b/i, topic: "Facts" },
    { regex: /\b(analyze|analysis|evaluate|assess|critique|examine)\b/i, topic: "Analysis" },
    {
      regex: /\b(explain|describe|elaborate|discuss|illustrate|demonstrate)\b/i,
      topic: "Explanations",
    },
  ];

  for (const { regex, topic } of patterns) {
    if (regex.test(text)) return topic;
  }

  return "General";
}

export function detectSimilarQuestions(questions: WrittenQuestion[]): Array<{
  similarity: string;
  questions: Array<{ index: number; question: string }>;
  reason: string;
}> {
  const duplicates: Array<{
    similarity: string;
    questions: Array<{ index: number; question: string }>;
    reason: string;
  }> = [];

  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const q1 = questions[i].question.toLowerCase();
      const q2 = questions[j].question.toLowerCase();

      const words1 = new Set(q1.match(/\b\w+\b/g) || []);
      const words2 = new Set(q2.match(/\b\w+\b/g) || []);
      const intersection = [...words1].filter((w) => words2.has(w));
      const union = new Set([...words1, ...words2]);
      const overlap = intersection.length / union.size;

      if (overlap > 0.7) {
        duplicates.push({
          similarity: "high_word_overlap",
          questions: [
            { index: i, question: questions[i].question },
            { index: j, question: questions[j].question },
          ],
          reason: `High word overlap: ${(overlap * 100).toFixed(0)}%`,
        });
      }
    }
  }

  return duplicates;
}
