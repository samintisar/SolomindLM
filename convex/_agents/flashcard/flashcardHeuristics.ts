"use node";

import { createAgentGraphLogger } from "../_shared/logging.js";

import { PROBLEMATIC_PHRASES } from "./prompts.js";
import type { Flashcard } from "./state.js";
import { cleanBackText, cleanFrontText } from "./textCleanup.js";

export interface SimilarFlashcardGroup {
  similarity: string;
  flashcards: Array<{ index: number; front: string; back: string }>;
  reason: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function extractWords(text: string): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized.match(/\b\w+\b/g) || [];
  return new Set(words);
}

export function extractTopic(card: Flashcard): string {
  if (card.topic && card.topic.trim().length > 0) {
    return card.topic.trim();
  }

  return "Uncategorized";
}

export function groupFlashcardsByTopic(flashcards: Flashcard[]): Record<string, number> {
  const topics: Record<string, number> = {};

  for (const card of flashcards) {
    const topic = extractTopic(card);
    topics[topic] = (topics[topic] || 0) + 1;
  }

  return topics;
}

export function validateSelfContained(card: Flashcard): boolean {
  const logger = createAgentGraphLogger("FlashcardGraph", "flashcard");
  const text = card.front.toLowerCase();
  const hasProblematicPhrase = PROBLEMATIC_PHRASES.some((phrase) => text.includes(phrase));
  const isShort = text.length < 150;
  const shouldReject = hasProblematicPhrase && isShort;

  if (shouldReject) {
    logger.warn("Flashcard rejected: short with potential external references", {
      agent: "FlashcardGraph",
      phase: "validate_self_contained",
      questionPreview: card.front.substring(0, 100),
      questionLength: text.length,
      foundPhrases: PROBLEMATIC_PHRASES.filter((phrase) => text.includes(phrase)),
    });
  } else if (hasProblematicPhrase && !isShort) {
    logger.info("Flashcard accepted: has phrases but is long enough to include context", {
      agent: "FlashcardGraph",
      phase: "validate_self_contained_accept",
      questionPreview: card.front.substring(0, 100),
      questionLength: text.length,
      foundPhrases: PROBLEMATIC_PHRASES.filter((phrase) => text.includes(phrase)),
    });
  }

  return !shouldReject;
}

export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

export async function detectSimilarFlashcards(
  flashcards: Flashcard[]
): Promise<SimilarFlashcardGroup[]> {
  const duplicates: SimilarFlashcardGroup[] = [];

  const COMPARISON_WINDOW = 20;
  const YIELD_INTERVAL = 50;
  const LARGE_SET_THRESHOLD = 100;
  const useWindowedComparison = flashcards.length > 200;

  let comparisonCount = 0;

  for (let i = 0; i < flashcards.length; i++) {
    const startJ = useWindowedComparison
      ? Math.max(i + 1, flashcards.length - COMPARISON_WINDOW)
      : i + 1;

    for (let j = startJ; j < flashcards.length; j++) {
      comparisonCount++;

      if (flashcards.length > LARGE_SET_THRESHOLD && comparisonCount % YIELD_INTERVAL === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const f1 = flashcards[i];
      const f2 = flashcards[j];

      const words1 = extractWords(f1.front);
      const words2 = extractWords(f2.front);
      const intersection = [...words1].filter((w) => words2.has(w));
      const union = new Set([...words1, ...words2]);
      const frontOverlap = intersection.length / union.size;

      if (frontOverlap > 0.7) {
        duplicates.push({
          similarity: "high_front_overlap",
          flashcards: [
            { index: i, front: f1.front, back: f1.back },
            { index: j, front: f2.front, back: f2.back },
          ],
          reason: `Front word overlap: ${(frontOverlap * 100).toFixed(0)}%`,
        });
        continue;
      }

      const backWords1 = extractWords(f1.back);
      const backWords2 = extractWords(f2.back);
      const backIntersection = [...backWords1].filter((w) => backWords2.has(w));
      const backUnion = new Set([...backWords1, ...backWords2]);
      const backOverlap = backIntersection.length / backUnion.size;

      if (backOverlap > 0.75) {
        duplicates.push({
          similarity: "high_back_overlap",
          flashcards: [
            { index: i, front: f1.front, back: f1.back },
            { index: j, front: f2.front, back: f2.back },
          ],
          reason: `Back word overlap: ${(backOverlap * 100).toFixed(0)}%`,
        });
        continue;
      }

      const normalizedFront1 = normalizeText(f1.front);
      const normalizedFront2 = normalizeText(f2.front);

      const isDefinition1 = /^(what is|define|explain|describe)/.test(normalizedFront1);
      const isDefinition2 = /^(what is|define|explain|describe)/.test(normalizedFront2);

      if (isDefinition1 && isDefinition2) {
        const words1Arr = normalizedFront1.split(/\s+/);
        const words2Arr = normalizedFront2.split(/\s+/);
        const term1 = words1Arr[words1Arr.length - 1] || "";
        const term2 = words2Arr[words2Arr.length - 1] || "";

        if (term1 === term2 && term1.length > 2) {
          duplicates.push({
            similarity: "same_definition_pattern",
            flashcards: [
              { index: i, front: f1.front, back: f1.back },
              { index: j, front: f2.front, back: f2.back },
            ],
            reason: `Both define same term: "${term1}"`,
          });
          continue;
        }
      }

      if (!useWindowedComparison) {
        const charSimilarity = (s1: string, s2: string): number => {
          const longer = s1.length > s2.length ? s1 : s2;
          const shorter = s1.length > s2.length ? s2 : s1;
          if (longer.length === 0) return 1.0;
          return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
        };

        const frontCharSim = charSimilarity(normalizedFront1, normalizedFront2);
        if (frontCharSim > 0.85) {
          duplicates.push({
            similarity: "high_character_similarity",
            flashcards: [
              { index: i, front: f1.front, back: f1.back },
              { index: j, front: f2.front, back: f2.back },
            ],
            reason: `Character similarity: ${(frontCharSim * 100).toFixed(0)}%`,
          });
        }
      }
    }
  }

  return duplicates;
}

export function heuristicDedupeFlashcards(flashcards: Flashcard[]): {
  dedupedFlashcards: Flashcard[];
  duplicatesRemoved: number;
} {
  const logger = createAgentGraphLogger("FlashcardGraph", "flashcard");
  const dedupedByExactKey = new Map<string, Flashcard>();
  const exactKeyByFront = new Map<string, string>();
  let duplicatesRemoved = 0;

  for (const flashcard of flashcards) {
    const normalizedFlashcard: Flashcard = {
      ...flashcard,
      front: cleanFrontText(flashcard.front),
      back: cleanBackText(flashcard.back),
    };

    const frontKey = normalizeText(normalizedFlashcard.front);
    const backKey = normalizeText(normalizedFlashcard.back);
    const exactKey = `${frontKey}::${backKey}`;

    if (!frontKey || !backKey) {
      continue;
    }

    if (dedupedByExactKey.has(exactKey)) {
      duplicatesRemoved += 1;
      continue;
    }

    const existingExactKeyForFront = exactKeyByFront.get(frontKey);
    if (existingExactKeyForFront) {
      const existingFlashcard = dedupedByExactKey.get(existingExactKeyForFront);
      if (existingFlashcard) {
        const existingScore = existingFlashcard.front.length + existingFlashcard.back.length;
        const candidateScore = normalizedFlashcard.front.length + normalizedFlashcard.back.length;

        if (candidateScore > existingScore) {
          dedupedByExactKey.delete(existingExactKeyForFront);
          dedupedByExactKey.set(exactKey, normalizedFlashcard);
          exactKeyByFront.set(frontKey, exactKey);
        }
      }

      duplicatesRemoved += 1;
      continue;
    }

    dedupedByExactKey.set(exactKey, normalizedFlashcard);
    exactKeyByFront.set(frontKey, exactKey);
  }

  const dedupedFlashcards = [...dedupedByExactKey.values()];

  logger.info(
    `Heuristic dedupe: ${flashcards.length} → ${dedupedFlashcards.length} flashcards (removed ${duplicatesRemoved})`,
    {
      agent: "FlashcardGraph",
      phase: "heuristic_dedupe",
      inputCount: flashcards.length,
      outputCount: dedupedFlashcards.length,
      duplicatesRemoved,
    }
  );

  return {
    dedupedFlashcards,
    duplicatesRemoved,
  };
}
