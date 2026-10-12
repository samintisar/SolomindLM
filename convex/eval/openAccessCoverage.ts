"use node";
/**
 * Measures #480: on a seeded sample of article DOIs from OpenAlex, how often the old path got a
 * PDF (the provider's single OA link downloads as a real PDF) versus the new resolver (any
 * candidate yields a real PDF or a full-text-length HTML page). No OCR, to keep the cost down.
 *
 * Runs in batches to stay inside the 600 s action limit; the sample is the same for every batch.
 *
 *   npx convex run eval/openAccessCoverage:run '{"offset": 0, "limit": 25}'
 *   … offset 25, 50, … 175, then add the batch counts.
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

type SampledWork = { doi?: string | null; open_access?: { oa_url?: string | null } };

async function sampleWorks(seed: number): Promise<SampledWork[]> {
  const mailto = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const url =
    `https://api.openalex.org/works?sample=${SAMPLE_SIZE}&seed=${seed}&per-page=${SAMPLE_SIZE}` +
    `&filter=has_doi:true,type:article&select=doi,open_access&mailto=${mailto}`;
  const res = await fetch(url, { headers: { "User-Agent": openAccessUserAgent() } });
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
    const limit = args.limit ?? 25;
    const scrapeHtml = args.scrapeHtml ?? true;
    const works = (await sampleWorks(args.seed ?? 480)).slice(offset, offset + limit);

    const results = await allWithConcurrency(
      works.map((work) => async () => {
        const oaUrl = work.open_access?.oa_url;
        const before = oaUrl ? (await fetchOaCandidate(oaUrl)).type === "pdf" : false;

        let after: "oa_pdf" | "oa_html" | null = null;
        const candidates = await resolveOpenAccessCandidates({ doi: work.doi ?? undefined });
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
        return { before, after, candidates: candidates.length };
      }),
      5
    );

    const summary = {
      offset,
      total: results.length,
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
