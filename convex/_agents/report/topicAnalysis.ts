"use node";

/**
 * Extract topics from Markdown text.
 */
export function extractTopicsFromMarkdown(markdown: string): string[] {
  const topics: string[] = [];
  const cleanOutput = markdown.replace(/\*\*/g, "").trim();

  const mainTopicsMatch = cleanOutput.match(
    /Main Topics:?([\s\S]+?)(?=\n\n|\n[A-Z][a-z]+:|- Key Insights|- Learning Objectives|Key Concepts|Main Themes|Supporting Evidence|Action Items|Potential Quiz|Notable Quotes|Actionable Advice|Key Evidence|Important Conclusions|Technical Specifications|Methodologies|Data and Metrics|Findings|Core Concepts|Relationships|Examples|Common Misconceptions|Research Methods|Frameworks Applied|Data Collection|Analysis Approaches|##|$)/i
  );

  if (mainTopicsMatch) {
    const content = mainTopicsMatch[1].trim();

    if (content.includes(",") && !content.includes("\n")) {
      content.split(",").forEach((t) => {
        const topic = t
          .trim()
          .replace(/^-\s*/, "")
          .replace(/^\d+\.\s*/, "");
        if (topic.length > 2 && topic.length < 100) {
          topics.push(topic);
        }
      });
    } else {
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || /^[A-Z][a-z]+:/.test(trimmed)) continue;

        const topic = trimmed.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "");
        if (topic.length > 2 && topic.length < 100) {
          topics.push(topic);
        }
      }
    }
  }

  if (topics.length === 0) {
    const topicLines = cleanOutput.match(/^[-*•]\s+[A-Z].+$/gm) || [];
    for (const line of topicLines.slice(0, 5)) {
      const topic = line.replace(/^[-*•]\s+/, "").trim();
      if (topic.length > 2 && topic.length < 100) {
        topics.push(topic);
      }
    }
  }

  const uniqueTopics = Array.from(new Set(topics)).filter((t) => {
    const lower = t.toLowerCase();
    return (
      !lower.includes("main topics") &&
      !lower.includes("key insights") &&
      !lower.includes("learning objectives") &&
      !lower.includes("all of the above") &&
      t.length < 100
    );
  });

  return uniqueTopics.length > 0 ? uniqueTopics : ["General Content"];
}

/**
 * Extract topics from an output string (JSON MapOutput or Markdown).
 */
export function extractTopicsFromOutput(output: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(output) as any;
    if (parsed._error === true) {
      return [];
    }
    if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      return parsed.topics;
    }
  } catch {
    // Not JSON
  }

  return extractTopicsFromMarkdown(output);
}

export function groupOutputsByTopic(outputs: string[]): Record<string, number> {
  const topics: Record<string, number> = {};

  for (const output of outputs) {
    const extractedTopics = extractTopicsFromOutput(output);
    const primaryTopic = extractedTopics[0] || "Unknown";
    topics[primaryTopic] = (topics[primaryTopic] || 0) + 1;
  }

  return topics;
}

export function analyzeAllTopics(outputs: string[]): {
  topics: Record<string, number>;
  allTopics: string[];
} {
  const topicCounts: Record<string, number> = {};
  const allTopics: string[] = [];

  for (const output of outputs) {
    const topics = extractTopicsFromOutput(output);
    allTopics.push(...topics);

    for (const topic of topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }

  return { topics: topicCounts, allTopics };
}
