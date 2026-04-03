"use node"

import { createAgentGraphLogger } from '../_shared/logging.js';

import type { QuizCandidate } from './prompts.js';

/**
 * Calculate text similarity between two quiz questions.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function calculateSimilarity(q1: QuizCandidate, q2: QuizCandidate): number {
  // Stop words to filter out for better similarity detection
  const stopWords = new Set([
    'the', 'is', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by',
    'for', 'with', 'from', 'as', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'can', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
  ]);

  // Extract words and filter stop words
  const extractWords = (text: string): Set<string> => {
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    const words = (normalized.match(/\b\w+\b/g) || []);
    return new Set(words.filter(w => !stopWords.has(w)));
  };

  const q1Text = `${q1.question} ${q1.correctAnswer}`;
  const q2Text = `${q2.question} ${q2.correctAnswer}`;

  // Calculate word overlap for question text (without stop words)
  const words1 = extractWords(q1Text);
  const words2 = extractWords(q2Text);

  // If both questions have very few meaningful words, consider them less similar
  if (words1.size <= 1 || words2.size <= 1) {
    // Short questions need higher threshold to be considered similar
    const textSimilarity = q1Text === q2Text ? 1 : 0;
    return textSimilarity;
  }

  // Calculate Jaccard similarity: intersection / union
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  const questionSimilarity = union.size > 0 ? intersection.size / union.size : 0;

  return questionSimilarity;
}

/**
 * Heuristic deduplication using text similarity.
 * Compares questions for overlap and removes duplicates above threshold.
 * This is much faster than LLM-based deduplication and works well for quiz questions.
 */
export function heuristicDedupe(questions: QuizCandidate[]): QuizCandidate[] {
  const logger = createAgentGraphLogger('QuizGraph', 'quiz');
  if (questions.length <= 1) return questions;

  const SIMILARITY_THRESHOLD = 0.8; // 80% similarity considered duplicate
  const toRemove = new Set<number>();

  for (let i = 0; i < questions.length; i++) {
    if (toRemove.has(i)) continue;

    for (let j = i + 1; j < questions.length; j++) {
      if (toRemove.has(j)) continue;

      const similarity = calculateSimilarity(questions[i], questions[j]);
      if (similarity >= SIMILARITY_THRESHOLD) {
        // Remove the second duplicate (keep the first one)
        toRemove.add(j);
      }
    }
  }

  const uniqueCount = questions.length - toRemove.size;
  logger.info(`Heuristic dedupe: ${questions.length} → ${uniqueCount} questions (removed ${toRemove.size} duplicates)`, {
    agent: 'QuizGraph',
    phase: 'heuristic_dedupe',
    inputCount: questions.length,
    duplicatesFound: toRemove.size,
    outputCount: uniqueCount,
  });

  return questions.filter((_, idx) => !toRemove.has(idx));
}

/**
 * Detect semantically similar questions using simple heuristics.
 */
export function detectSimilarQuestions(questions: QuizCandidate[]): Array<{
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
      const q1 = `${questions[i].question} ${questions[i].correctAnswer}`.toLowerCase();
      const q2 = `${questions[j].question} ${questions[j].correctAnswer}`.toLowerCase();

      const words1 = new Set(q1.match(/\b\w+\b/g) || []);
      const words2 = new Set(q2.match(/\b\w+\b/g) || []);
      const intersection = [...words1].filter(w => words2.has(w));
      const union = new Set([...words1, ...words2]);
      const overlap = intersection.length / union.size;

      if (overlap > 0.7) {
        duplicates.push({
          similarity: 'high_word_overlap',
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
