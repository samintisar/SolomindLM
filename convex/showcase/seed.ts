/**
 * Showcase seed (public-notebooks spec, PR 3). Internal only, run by the maintainer:
 *   npx convex run showcase/seed:seedShowcase '{"ownerEmail":"…"}'
 * `seedShowcase` checks the manifest and the owner and starts one `tick` chain per notebook. A tick
 * reads the notebook's state, runs the next steps from `planSeed`, and schedules the next tick until
 * the notebook is done or blocked. Every step's mutation re-checks the database, so ticks, re-runs and
 * overlapping chains never duplicate work. Progress: `showcase/db:seedStatus`.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { DoiResolverService } from "../_services/extraction/DoiResolverService";
import { openAccessUserAgent } from "../_services/extraction/openAccess/OpenAccessResolver";
import type { DiscoverAcademicPapersResult } from "../_services/search/AcademicSearchService";
import { type PaperDiscovery, SHOWCASE_NOTEBOOKS } from "./manifest";
import { validateManifest } from "./manifestValidation";
import { paperKey, pickDiscoveredPapers, type ResolvedPaper } from "./papers";
import { DEFAULT_MAX_IN_FLIGHT, type SeedStep } from "./plan";

/** Poll interval while only waiting, and after starting something. */
const WAIT_TICK_MS = 60_000;
const BUSY_TICK_MS = 10_000;
/** A chain gives up after ~4 hours of polling. */
const MAX_TICKS = 240;
/** Notebook chains start this far apart. */
const STAGGER_MS = 20_000;
const MAX_IN_FLIGHT_CAP = 4;
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60_000;
const DISCOVERY_RESULTS = 20;
const MAX_DOI_LOOKUPS = 12;

const tickArgs = {
  ownerEmail: v.string(),
  slug: v.string(),
  publish: v.boolean(),
  maxInFlight: v.number(),
  tick: v.number(),
};

export const seedShowcase = internalAction({
  args: {
    ownerEmail: v.string(),
    /** One notebook; all of them when omitted. */
    slug: v.optional(v.string()),
    /** Make finished notebooks public and featured. Off by default: review first. */
    publish: v.optional(v.boolean()),
    maxInFlight: v.optional(v.number()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> => {
    const errors = validateManifest(SHOWCASE_NOTEBOOKS);
    if (errors.length > 0) {
      throw new Error(`The showcase manifest is invalid:\n${errors.join("\n")}`);
    }
    await ctx.runQuery(internal.showcase.db.assertOwner, { ownerEmail: args.ownerEmail });
    const notebooks = args.slug
      ? SHOWCASE_NOTEBOOKS.filter((n) => n.slug === args.slug)
      : SHOWCASE_NOTEBOOKS;
    if (notebooks.length === 0) throw new Error(`No showcase notebook "${args.slug}"`);
    const maxInFlight = Math.max(
      1,
      Math.min(args.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT, MAX_IN_FLIGHT_CAP)
    );
    for (const [i, notebook] of notebooks.entries()) {
      await ctx.scheduler.runAfter(i * STAGGER_MS, internal.showcase.seed.tick, {
        ownerEmail: args.ownerEmail,
        slug: notebook.slug,
        publish: args.publish ?? false,
        maxInFlight,
        tick: 1,
      });
    }
    return notebooks.map((n) => n.slug);
  },
});

export const tick = internalAction({
  args: tickArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const logger = createServiceLogger("showcase", "tick");
    const { plan, paperKeys } = await ctx.runQuery(internal.showcase.db.getSeedState, {
      ownerEmail: args.ownerEmail,
      slug: args.slug,
      publish: args.publish,
      maxInFlight: args.maxInFlight,
    });
    logger.info("showcase_tick", {
      slug: args.slug,
      tick: args.tick,
      state: plan.state,
      steps: plan.steps.map((s) => s.type),
      waitingOn: plan.waitingOn,
      problems: plan.problems,
    });
    if (plan.state === "done") return null;
    if (plan.state === "blocked") {
      logger.warn("showcase_blocked", { slug: args.slug, problems: plan.problems });
      return null;
    }
    if (args.tick > 1 && plan.steps.some((s) => s.type === "createNotebook")) {
      // Deleted while the chain was running (a rollback): don't recreate it.
      logger.warn("showcase_notebook_gone", { slug: args.slug });
      return null;
    }
    for (const step of plan.steps) {
      try {
        await runStep(ctx, args, step, paperKeys);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("showcase_step_failed", { slug: args.slug, step: step.type, error: message });
        throw new Error(`Showcase "${args.slug}": ${step.type} failed: ${message}`);
      }
    }
    if (args.tick >= MAX_TICKS) {
      logger.warn("showcase_gave_up", { slug: args.slug, waitingOn: plan.waitingOn });
      return null;
    }
    await ctx.scheduler.runAfter(
      plan.steps.length > 0 ? BUSY_TICK_MS : WAIT_TICK_MS,
      internal.showcase.seed.tick,
      { ...args, tick: args.tick + 1 }
    );
    return null;
  },
});

function spec(slug: string) {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) throw new Error(`No showcase notebook "${slug}"`);
  return notebook;
}

async function runStep(
  ctx: ActionCtx,
  args: { ownerEmail: string; slug: string },
  step: SeedStep,
  paperKeys: string[]
): Promise<void> {
  const ref = { ownerEmail: args.ownerEmail, slug: args.slug };
  switch (step.type) {
    case "createNotebook":
      await ctx.runMutation(internal.showcase.db.ensureNotebook, ref);
      return;
    case "addSource": {
      const source = spec(args.slug).sources[step.sourceIndex];
      if (source.kind !== "file") {
        await ctx.runMutation(internal.showcase.db.addSource, {
          ...ref,
          sourceIndex: step.sourceIndex,
        });
        return;
      }
      const storageId = await fetchPdfToStorage(ctx, source.url);
      try {
        await ctx.runMutation(internal.showcase.db.attachFileSource, {
          ...ref,
          sourceIndex: step.sourceIndex,
          storageId,
        });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }
      return;
    }
    case "discoverPapers": {
      const discovery = spec(args.slug).paperDiscovery;
      if (!discovery) throw new Error("No paperDiscovery in the manifest");
      const { papers, rateLimited } = await discoverPapers(
        ctx,
        discovery,
        new Set(paperKeys),
        step.needed
      );
      const added = await ctx.runMutation(internal.showcase.db.addDiscoveredPapers, {
        ...ref,
        papers,
      });
      if (added === 0 && !rateLimited) {
        throw new Error(
          `Discovery for "${discovery.query}" found no new papers; widen the query or filters`
        );
      }
      return;
    }
    case "startStudioItem":
      await ctx.runMutation(internal.showcase.db.startStudioItem, {
        ...ref,
        itemIndex: step.itemIndex,
      });
      return;
    case "startLiteratureReview":
      await ctx.runMutation(internal.showcase.db.startShowcaseLiteratureReview, ref);
      return;
    case "confirmLiteratureReviewColumns":
      await ctx.runMutation(internal.showcase.db.confirmShowcaseLiteratureReview, ref);
      return;
    case "copyLiteratureReviewToStudio":
      await ctx.runMutation(internal.showcase.db.copyLiteratureReviewToStudio, ref);
      return;
    case "startDeepResearch":
      await ctx.runMutation(internal.showcase.db.startShowcaseDeepResearch, ref);
      return;
    case "approveDeepResearchPlan":
      await ctx.runMutation(internal.showcase.db.approveShowcaseDeepResearch, ref);
      return;
    case "publish":
      await ctx.runMutation(internal.showcase.db.publishShowcaseNotebook, ref);
      return;
  }
}

/** Downloads a PDF (declared user agent, size cap, `%PDF-` check) into Convex storage. */
async function fetchPdfToStorage(ctx: ActionCtx, url: string): Promise<Id<"_storage">> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": openAccessUserAgent(), Accept: "application/pdf" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(
        `${url} is ${bytes.byteLength} bytes; the seed stores PDFs up to ${MAX_PDF_BYTES}`
      );
    }
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
      throw new Error(`${url} is not a PDF`);
    }
    return await ctx.storage.store(new Blob([bytes], { type: "application/pdf" }));
  } finally {
    clearTimeout(timer);
  }
}

/** Full metadata (authors, venue, licence) through the "Import from DOI" resolver. */
async function resolvePapers(ids: string[]): Promise<ResolvedPaper[]> {
  const resolver = new DoiResolverService();
  const resolved: ResolvedPaper[] = [];
  for (const id of ids) {
    try {
      // Accepts a DOI or an arXiv link; anything else throws and is skipped.
      const record = await resolver.resolve(id);
      if (!record) continue;
      const { title, sourceType: _sourceType, ...paperRecord } = record;
      resolved.push({ title, paperRecord });
    } catch {
      // An unresolvable id is skipped, like a failed DOI lookup in the dialog.
    }
  }
  return resolved;
}

/**
 * Pinned DOIs when the manifest has them (prod gets the dev run's papers); otherwise Discover's
 * academic search, then the DOI resolver. Rate-limited searches return nothing; the next tick
 * tries again.
 */
async function discoverPapers(
  ctx: ActionCtx,
  discovery: PaperDiscovery,
  existingKeys: ReadonlySet<string>,
  needed: number
): Promise<{ papers: ResolvedPaper[]; rateLimited: boolean }> {
  if (discovery.pinnedDois) {
    const pinned = await resolvePapers(discovery.pinnedDois);
    // Keep the pinned order: no licence re-ranking.
    const fresh = pinned.filter((paper) => !existingKeys.has(paperKey(paper)));
    return { papers: fresh.slice(0, needed), rateLimited: false };
  }
  const { sources, rateLimited }: DiscoverAcademicPapersResult = await ctx.runAction(
    internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
    { query: discovery.query, maxResults: DISCOVERY_RESULTS, ...discovery.filters }
  );
  const resolved = await resolvePapers(
    sources.slice(0, MAX_DOI_LOOKUPS).map((source) => source.metadata?.doi ?? source.url)
  );
  return { papers: pickDiscoveredPapers(resolved, existingKeys, needed), rateLimited };
}
