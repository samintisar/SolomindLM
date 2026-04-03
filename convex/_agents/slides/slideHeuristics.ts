"use node"

import { createAgentGraphLogger } from '../_shared/logging.js';

import type { SlideCandidate } from './prompts.js';

export function calculateSlideSimilarity(s1: SlideCandidate, s2: SlideCandidate): number {
  const text1 = `${s1.title} ${s1.content}`.toLowerCase();
  const text2 = `${s2.title} ${s2.content}`.toLowerCase();

  const stopWords = new Set([
    'the', 'is', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can',
  ]);

  const extractWords = (text: string): Set<string> => {
    const words = text.match(/\b\w+\b/g) || [];
    return new Set(words.filter((w) => !stopWords.has(w)));
  };

  const words1 = extractWords(text1);
  const words2 = extractWords(text2);
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

export function heuristicDedupeSlides(slides: SlideCandidate[]): SlideCandidate[] {
  const logger = createAgentGraphLogger('SlideDeckGraph', 'slides');
  const SIMILARITY_THRESHOLD = 0.75;
  const toRemove = new Set<number>();

  for (let i = 0; i < slides.length; i++) {
    for (let j = i + 1; j < slides.length; j++) {
      const similarity = calculateSlideSimilarity(slides[i], slides[j]);
      if (similarity >= SIMILARITY_THRESHOLD) {
        toRemove.add(j);
      }
    }
  }

  const dedupedCount = slides.length - toRemove.size;
  logger.info(`Deduplication: ${slides.length} → ${dedupedCount} slides (${toRemove.size} duplicates removed)`, {
    agent: 'SlideDeckGraph',
    phase: 'heuristic_dedupe',
    inputCount: slides.length,
    outputCount: dedupedCount,
    duplicatesRemoved: toRemove.size,
  });

  return slides.filter((_, idx) => !toRemove.has(idx));
}

export function groupSlidesByTopicForSelection(slides: SlideCandidate[]): Record<string, SlideCandidate[]> {
  const groups: Record<string, SlideCandidate[]> = {};
  const patterns = {
    'Introduction/Foundation': ['introduction', 'overview', 'background', 'basics', 'foundation'],
    'Concepts/Definitions': ['definition', 'concept', 'what is', 'meaning', 'terminology'],
    'Processes/Methods': ['process', 'method', 'how to', 'approach', 'technique', 'strategy'],
    'Benefits/Justification': ['benefit', 'advantage', 'why', 'importance', 'value'],
    'Examples/Applications': ['example', 'application', 'use case', 'case study', 'illustration'],
    'Conclusion/Summary': ['conclusion', 'summary', 'final', 'wrap up', 'recap'],
    'Challenges/Problems': ['challenge', 'problem', 'issue', 'difficulty', 'obstacle'],
    'Future/Trends': ['future', 'trend', 'next', 'upcoming', 'emerging'],
  };

  for (const slide of slides) {
    let topic = 'General';
    const lower = slide.title.toLowerCase();
    for (const [key, keywords] of Object.entries(patterns)) {
      if (keywords.some((k) => lower.includes(k))) {
        topic = key;
        break;
      }
    }
    if (!groups[topic]) groups[topic] = [];
    groups[topic].push(slide);
  }

  return groups;
}

export function preSelectSlides(slides: SlideCandidate[], maxSlides: number): SlideCandidate[] {
  const logger = createAgentGraphLogger('SlideDeckGraph', 'slides');
  if (slides.length <= maxSlides) {
    logger.info(`Pre-select: ${slides.length} slides (within limit)`, {
      agent: 'SlideDeckGraph',
      phase: 'pre_select',
      inputCount: slides.length,
      outputCount: slides.length,
      maxSlides,
    });
    return slides;
  }

  const grouped = groupSlidesByTopicForSelection(slides);
  const selected: SlideCandidate[] = [];
  const slidesPerTopic = Math.ceil(maxSlides / Object.keys(grouped).length);

  for (const topic of Object.keys(grouped)) {
    const shuffled = [...grouped[topic]].sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, Math.min(slidesPerTopic, shuffled.length)));
  }

  const result = selected.slice(0, maxSlides);

  logger.info(`Pre-select: ${slides.length} → ${result.length} slides (topic-based selection)`, {
    agent: 'SlideDeckGraph',
    phase: 'pre_select',
    inputCount: slides.length,
    outputCount: result.length,
    maxSlides,
    topicsFound: Object.keys(grouped).length,
  });

  return result;
}

export function selectSlidesHeuristic(
  candidates: SlideCandidate[],
  targetCount: number,
  minSlides: number,
  maxSlides: number
): SlideCandidate[] {
  const logger = createAgentGraphLogger('SlideDeckGraph', 'slides');
  const grouped = groupSlidesByTopicForSelection(candidates);
  const topicOrder = [
    'Introduction/Foundation',
    'Concepts/Definitions',
    'Processes/Methods',
    'Benefits/Justification',
    'Examples/Applications',
    'Challenges/Problems',
    'Future/Trends',
    'Conclusion/Summary',
  ];

  const sortedTopics = Object.keys(grouped).sort((a, b) => {
    const idxA = topicOrder.indexOf(a);
    const idxB = topicOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const selected: SlideCandidate[] = [];
  const slidesPerTopic = Math.ceil(targetCount / sortedTopics.length);

  for (const topic of sortedTopics) {
    if (selected.length >= targetCount) break;
    const topicSlides = grouped[topic];
    const toTake = Math.min(slidesPerTopic, topicSlides.length, targetCount - selected.length);
    selected.push(...topicSlides.slice(0, toTake));
  }

  const result = selected.slice(0, maxSlides);

  logger.info(`Heuristic fallback: ${candidates.length} → ${result.length} slides`, {
    agent: 'SlideDeckGraph',
    phase: 'heuristic_selection_fallback',
    inputCount: candidates.length,
    outputCount: result.length,
    targetCount,
    minSlides,
    maxSlides,
  });

  return result;
}
