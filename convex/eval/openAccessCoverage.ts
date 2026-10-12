"use node";
/**
 * Measures #480: on a seeded sample of article DOIs from OpenAlex, how often the old path got a
 * PDF (the provider's single OA link downloads as a real PDF) versus the new resolver (any
 * candidate yields a real PDF or a full-text-length HTML page). No OCR, to keep the cost down.
 *
 * Runs in batches to stay inside the 600 s action limit; the sample is the same for every batch.
 *
 *   npx convex run eval/openAccessCoverage:run '{"offset": 0, "limit": 15}'
 *   … offset 15, 30, … 195, then add the batch counts.
 */

import { v } from "convex/values";
import { allWithConcurrency } from "../_agents/_shared/concurrency";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { env } from "../_lib/env";
import { fetchOaCandidate } from "../_services/extraction/openAccess/fetchOaCandidate";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import {
  openAccessUserAgent,
  resolveOpenAccessCandidates,
} from "../_services/extraction/openAccess/OpenAccessResolver";
import { MAX_CANDIDATE_ATTEMPTS } from "../documents/paperIngest";

const SAMPLE_SIZE = 200;
/** A paper that would start after this is skipped, so the batch ends inside the 600 s action limit. */
const BATCH_DEADLINE_MS = 450_000;
const SAMPLE_FETCH_TIMEOUT_MS = 15_000;

type SampledWork = { doi?: string | null; open_access?: { oa_url?: string | null } };

async function sampleWorks(seed: number): Promise<SampledWork[]> {
  const mailto = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const url =
    `https://api.openalex.org/works?sample=${SAMPLE_SIZE}&seed=${seed}&per-page=${SAMPLE_SIZE}` +
    `&filter=has_doi:true,type:article&select=doi,open_access&mailto=${mailto}`;
  const res = await fetch(url, {
    headers: { "User-Agent": openAccessUserAgent() },
    signal: AbortSignal.timeout(SAMPLE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAlex sample failed: HTTP ${res.status}`);
  return ((await res.json()) as { results: SampledWork[] }).results;
}

export const run = internalAction({
  args: {
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
    seed: v.optional(v.number()),
    scrapeHtml: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 15;
    const startedAt = Date.now();
    const scrapeHtml = args.scrapeHtml ?? true;
    const works = (await sampleWorks(args.seed ?? 480)).slice(offset, offset + limit);

    const results = await allWithConcurrency(
      works.map((work) => async () => {
        if (Date.now() - startedAt > BATCH_DEADLINE_MS) {
          return { skipped: true as const, before: false, after: null, candidates: 0 };
        }
        const oaUrl = work.open_access?.oa_url;
        const before = oaUrl ? (await fetchOaCandidate(oaUrl)).type === "pdf" : false;

        let after: "oa_pdf" | "oa_html" | null = null;
        const candidates = await resolveOpenAccessCandidates({
          doi: work.doi ?? undefined,
          pdfUrl: oaUrl ?? undefined,
        });
        for (const candidate of candidates.slice(0, MAX_CANDIDATE_ATTEMPTS)) {
          const fetched = await fetchOaCandidate(candidate.url);
          if (fetched.type === "pdf") {
            after = "oa_pdf";
            break;
          }
          if (fetched.type === "html" && scrapeHtml) {
            try {
              const page = await ctx.runAction(
                internal._services.extractors.scrapeWebPageInternal,
                {
                  url: fetched.finalUrl,
                }
              );
              if (isFullTextLength(page.content, "")) {
                after = "oa_html";
                break;
              }
            } catch {
              // A failed scrape is a miss; try the next candidate.
            }
          }
        }
        const result = { skipped: false as const, before, after, candidates: candidates.length };
        // One line per paper so a batch killed at the action limit still leaves its data.
        console.log(JSON.stringify({ eval: "openAccessCoverage.paper", doi: work.doi, ...result }));
        return result;
      }),
      5
    );

    const summary = {
      offset,
      total: results.length,
      skipped: results.filter((r) => r.skipped).length,
      before: results.filter((r) => r.before).length,
      after: results.filter((r) => r.after).length,
      afterPdf: results.filter((r) => r.after === "oa_pdf").length,
      afterHtml: results.filter((r) => r.after === "oa_html").length,
      withAnyCandidate: results.filter((r) => r.candidates > 0).length,
    };
    console.log(JSON.stringify({ eval: "openAccessCoverage", ...summary }));
    return summary;
  },
});
