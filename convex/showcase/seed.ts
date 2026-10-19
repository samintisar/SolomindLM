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
import { validateManifest, validatePromptPacks } from "./manifestValidation";
import { paperKey, pickDiscoveredPapers, type ResolvedPaper } from "./papers";
import {
  DEFAULT_MAX_IN_FLIGHT,
  discoveryOutcome,
  nextTickDelay,
  type SeedStep,
  tickGate,
} from "./plan";
import { SHOWCASE_PROMPTS } from "./promptPacks";

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
    const errors = [
      ...validateManifest(SHOWCASE_NOTEBOOKS),
      ...validatePromptPacks(SHOWCASE_PROMPTS),
    ];
    if (errors.length > 0) {
      throw new Error(`The showcase manifest is invalid:\n${errors.join("\n")}`);
    }
    await ctx.runQuery(internal.showcase.db.assertOwner, { ownerEmail: args.ownerEmail });
    // The notebooks' Studio items use these prompts; they go public with the notebooks.
    await ctx.runMutation(internal.showcase.promptLibrary.syncShowcasePrompts, {
      ownerEmail: args.ownerEmail,
      publish: args.publish ?? false,
    });
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
    const gate = tickGate(plan, args.tick);
    if (!gate.run) {
      if (gate.reason === "blocked") {
        logger.warn("showcase_blocked", { slug: args.slug, problems: plan.problems });
      } else if (gate.reason === "notebook_gone") {
        logger.warn("showcase_notebook_gone", { slug: args.slug });
      }
      return null;
    }
    let backedOff = false;
    for (const step of plan.steps) {
      try {
        const result = await runStep(ctx, args, step, paperKeys);
        if (result === "backoff") {
          backedOff = true;
          logger.info("showcase_backoff", { slug: args.slug, step: step.type });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("showcase_step_failed", { slug: args.slug, step: step.type, error: message });
        throw new Error(`Showcase "${args.slug}": ${step.type} failed: ${message}`);
      }
    }
    const delay = nextTickDelay({ tick: args.tick, ranSteps: plan.steps.length, backedOff });
    if (delay === null) {
      logger.warn("showcase_gave_up", { slug: args.slug, waitingOn: plan.waitingOn });
      return null;
    }
    await ctx.scheduler.runAfter(delay, internal.showcase.seed.tick, {
      ...args,
      tick: args.tick + 1,
    });
    return null;
  },
});

function spec(slug: string) {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) throw new Error(`No showcase notebook "${slug}"`);
  return notebook;
}

/** "backoff": the step couldn't make progress yet (rate-limited) and the chain should wait. */
type StepResult = "done" | "backoff";

async function runStep(
  ctx: ActionCtx,
  args: { ownerEmail: string; slug: string },
  step: SeedStep,
  paperKeys: string[]
): Promise<StepResult> {
  const ref = { ownerEmail: args.ownerEmail, slug: args.slug };
  switch (step.type) {
    case "createNotebook":
      await ctx.runMutation(internal.showcase.db.ensureNotebook, ref);
      return "done";
    case "addSource": {
      const source = spec(args.slug).sources[step.sourceIndex];
      if (source.kind !== "file") {
        await ctx.runMutation(internal.showcase.db.addSource, {
          ...ref,
          sourceIndex: step.sourceIndex,
        });
        return "done";
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
      return "done";
    }
    case "discoverPapers": {
      const discovery = spec(args.slug).paperDiscovery;
      if (!discovery) throw new Error("No paperDiscovery in the manifest");
      const found = await discoverPapers(ctx, discovery, new Set(paperKeys), step.needed);
      const added = await ctx.runMutation(internal.showcase.db.addDiscoveredPapers, {
        ...ref,
        papers: found.papers,
      });
      const outcome = discoveryOutcome({
        query: discovery.query,
        pinned: Boolean(discovery.pinnedDois),
        searched: found.searched,
        resolved: found.resolved,
        added,
        rateLimited: found.rateLimited,
      });
      if (outcome.kind === "error") throw new Error(outcome.message);
      return outcome.kind === "backoff" ? "backoff" : "done";
    }
    case "startStudioItem":
      await ctx.runMutation(internal.showcase.db.startStudioItem, {
        ...ref,
        itemIndex: step.itemIndex,
      });
      return "done";
    case "startLiteratureReview":
      await ctx.runMutation(internal.showcase.db.startShowcaseLiteratureReview, ref);
      return "done";
    case "confirmLiteratureReviewColumns":
      await ctx.runMutation(internal.showcase.db.confirmShowcaseLiteratureReview, ref);
      return "done";
    case "copyLiteratureReviewToStudio":
      await ctx.runMutation(internal.showcase.db.copyLiteratureReviewToStudio, ref);
      return "done";
    case "startDeepResearch":
      await ctx.runMutation(internal.showcase.db.startShowcaseDeepResearch, ref);
      return "done";
    case "approveDeepResearchPlan":
      await ctx.runMutation(internal.showcase.db.approveShowcaseDeepResearch, ref);
      return "done";
    case "publish":
      await ctx.runMutation(internal.showcase.db.publishShowcaseNotebook, ref);
      return "done";
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

type DiscoveredPapers = {
  papers: ResolvedPaper[];
  /** Candidates looked up (search results, or pinned DOIs). */
  searched: number;
  /** Candidates the DOI resolver returned metadata for. */
  resolved: number;
  rateLimited: boolean;
};

/**
 * Pinned DOIs when the manifest has them (prod gets the dev run's papers); otherwise Discover's
 * academic search, then the DOI resolver. A rate-limited search returns nothing; the tick backs
 * off and the next one tries again (`discoveryOutcome`).
 */
async function discoverPapers(
  ctx: ActionCtx,
  discovery: PaperDiscovery,
  existingKeys: ReadonlySet<string>,
  needed: number
): Promise<DiscoveredPapers> {
  if (discovery.pinnedDois) {
    const pinned = await resolvePapers(discovery.pinnedDois);
    // Keep the pinned order: no licence re-ranking.
    const fresh = pinned.filter((paper) => !existingKeys.has(paperKey(paper)));
    return {
      papers: fresh.slice(0, needed),
      searched: discovery.pinnedDois.length,
      resolved: pinned.length,
      rateLimited: false,
    };
  }
  const { sources, rateLimited }: DiscoverAcademicPapersResult = await ctx.runAction(
    internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
    { query: discovery.query, maxResults: DISCOVERY_RESULTS, ...discovery.filters }
  );
  const lookups = sources
    .slice(0, MAX_DOI_LOOKUPS)
    .map((source) => source.metadata?.doi ?? source.url);
  const resolved = await resolvePapers(lookups);
  return {
    papers: pickDiscoveredPapers(resolved, existingKeys, needed),
    searched: lookups.length,
    resolved: resolved.length,
    rateLimited,
  };
}
