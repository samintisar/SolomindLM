/**
 * Source-aware metrics for evaluating retrieval and answer quality
 * across different source channel configurations.
 */
import type {
  EvalBaseline,
  EvalFixture,
  EvalRunArtifact,
  MetricResult,
  MetricStatus,
} from "../types";

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricStatus,
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

/**
 * Source Diversity Score
 * Measures whether the answer references multiple source types when
 * multiple channels were enabled.
 *
 * Score = 1 if multiple channels enabled and evidence from >1 source type found
 * Score = 0.5 if single channel or no diversity
 * Status: pass if score >= 0.5
 */
export function sourceDiversityScore(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];
  const evidence = artifact.sourceEvidence ?? [];

  if (channels.length <= 1) {
    return baseMetric(
      "source_diversity",
      fixture,
      artifact,
      "pass",
      1,
      "Single channel mode — diversity not applicable.",
      { channels, evidenceCount: evidence.length }
    );
  }

  const activeChannels = new Set(evidence.map((e) => e.channel));
  const score = activeChannels.size > 1 ? 1 : 0.5;
  const status = score >= 1 ? "pass" : "warn";

  return baseMetric(
    "source_diversity",
    fixture,
    artifact,
    status,
    score,
    `${activeChannels.size}/${channels.length} enabled channels produced evidence. Active: ${Array.from(activeChannels).join(", ")}`,
    { channels, activeChannels: Array.from(activeChannels), evidence }
  );
}

/**
 * Source Recall by Channel
 * For each enabled channel, checks if expected items were found in
 * chunks attributed to that source type.
 *
 * Returns one MetricResult per channel with recall score.
 */
export function sourceRecallByChannel(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult[] {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];

  if (fixture.expectedItems.length === 0) {
    return [
      baseMetric(
        "source_recall_by_channel",
        fixture,
        artifact,
        "pass",
        1,
        "No expected items — per-channel recall not applicable.",
        { channels }
      ),
    ];
  }

  // Group chunks by inferred source (from sourceUrl domain or metadata)
  const chunksBySource: Record<string, Array<{ content: string }>> = {};
  for (const chunk of artifact.selectedChunks) {
    const source = inferSourceChannel(chunk.sourceUrl);
    if (!chunksBySource[source]) chunksBySource[source] = [];
    chunksBySource[source].push(chunk);
  }

  return channels.map((channel) => {
    const channelChunks = chunksBySource[channel] ?? [];
    const combinedText = channelChunks.map((c) => c.content).join("\n");

    const matched: string[] = [];
    for (const item of fixture.expectedItems) {
      if (combinedText.toLowerCase().includes(item.toLowerCase())) {
        matched.push(item);
      }
    }
    const score =
      fixture.expectedItems.length > 0 ? matched.length / fixture.expectedItems.length : 1;

    return baseMetric(
      `source_recall_${channel}`,
      fixture,
      artifact,
      score >= 0.5 ? "pass" : score > 0 ? "warn" : "fail",
      score,
      `${matched.length}/${fixture.expectedItems.length} items found in ${channel} (${channelChunks.length} chunks).`,
      { channel, matched, chunkCount: channelChunks.length }
    );
  });
}

/**
 * Infer source channel from a URL or chunk metadata.
 */
export function inferSourceChannel(sourceUrl?: string): string {
  if (!sourceUrl) return "notebook";
  const url = sourceUrl.toLowerCase();
  if (url.includes("arxiv.org")) return "academic";
  if (url.includes("semanticscholar.org")) return "academic";
  if (url.includes("ncbi.nlm.nih.gov")) return "academic";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "social";
  if (url.includes("news") || url.includes("bbc") || url.includes("reuters")) return "news";
  if (
    url.includes("bloomberg") ||
    url.includes("wsj.com") ||
    url.includes("marketwatch") ||
    url.includes("investopedia") ||
    url.includes("ft.com") ||
    url.includes("yahoo.com/finance") ||
    url.includes("money")
  )
    return "finance";
  return "web";
}

/**
 * Research source breadth: unique external URLs in selected evidence.
 * Pass ≥8, warn 4–7, fail <4. Skipped for notebook-only policies.
 */
export function researchSourceBreadth(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];
  const hasExternal = channels.some((c) => c !== "notebook");

  if (!hasExternal) {
    return baseMetric(
      "research_source_breadth",
      fixture,
      artifact,
      "pass",
      1,
      "Notebook-only mode — source breadth not applicable.",
      { channels }
    );
  }

  const uniqueUrls = new Set(
    artifact.selectedChunks
      .filter((c) => inferSourceChannel(c.sourceUrl) !== "notebook")
      .map((c) => c.sourceUrl?.trim())
      .filter((url): url is string => Boolean(url))
  );
  const count = uniqueUrls.size;

  let status: MetricStatus;
  let score: number;
  if (count >= 8) {
    status = "pass";
    score = 1;
  } else if (count >= 4) {
    status = "warn";
    score = 0.5;
  } else {
    status = "fail";
    score = 0;
  }

  return baseMetric(
    "research_source_breadth",
    fixture,
    artifact,
    status,
    score,
    `${count} unique external source URL(s) in selected chunks (pass ≥8, warn 4–7).`,
    { uniqueSourceCount: count, channels }
  );
}

export function externalSourceUtilization(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline
): MetricResult {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];
  const hasExternal = channels.some((c) => c !== "notebook");

  if (!hasExternal) {
    return baseMetric(
      "external_source_utilization",
      fixture,
      artifact,
      "pass",
      1,
      "Notebook-only mode — external utilization not applicable.",
      { channels }
    );
  }

  const externalChunks = artifact.selectedChunks.filter((c) => {
    const source = inferSourceChannel(c.sourceUrl);
    return source !== "notebook";
  });

  const total = artifact.selectedChunks.length;
  const score = total > 0 ? externalChunks.length / total : 0;

  let status: MetricStatus;
  if (score >= 0.2) status = "pass";
  else if (score > 0) status = "warn";
  else status = "fail";

  return baseMetric(
    "external_source_utilization",
    fixture,
    artifact,
    status,
    score,
    `${externalChunks.length}/${total} selected chunks from external sources (${(score * 100).toFixed(1)}%).`,
    { externalChunks: externalChunks.length, total, channels }
  );
}
