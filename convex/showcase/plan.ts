/**
 * The seed's state machine. `planSeed` compares one manifest notebook with a snapshot of what the
 * database holds and returns the next steps. Pure, so it is unit-tested; `db.ts` builds the
 * snapshot and runs the steps, `seed.ts` calls it once per tick.
 */
import { type Infer, v } from "convex/values";
import { type ShowcaseNotebook, type StudioKind, sourceKey } from "./manifest";

/** Jobs one notebook runs at once, unless the caller passes `maxInFlight`. */
export const DEFAULT_MAX_IN_FLIGHT = 2;

export interface SeedSnapshot {
  notebookExists: boolean;
  isPublic: boolean;
  isFeatured: boolean;
  /** The notebook's documents; `key` matches `sourceKey` (or `paperKey` for papers). */
  sources: Array<{ key: string; title: string; fileType: string; status: string }>;
  /** The notebook's Studio rows, every kind. */
  studio: Array<{ kind: StudioKind; title: string; status: string }>;
  /** The latest literature review session. */
  literatureReview: null | {
    status: string;
    /** The workflow is paused in `awaitEvent` for the column confirmation. */
    awaitingColumns: boolean;
    /** A Studio copy of the session's table and report exists. */
    outputsInStudio: boolean;
  };
  /** The latest deep-research plan and its run. */
  deepResearch: null | {
    planStatus: string;
    /** The workflow is paused in `awaitEvent` for plan approval. */
    awaitingApproval: boolean;
    runStatus?: string;
    hasReport: boolean;
  };
}

export const seedStepValidator = v.union(
  v.object({ type: v.literal("createNotebook") }),
  v.object({ type: v.literal("addSource"), sourceIndex: v.number() }),
  v.object({ type: v.literal("discoverPapers"), needed: v.number() }),
  v.object({ type: v.literal("startStudioItem"), itemIndex: v.number() }),
  v.object({ type: v.literal("startLiteratureReview") }),
  v.object({ type: v.literal("confirmLiteratureReviewColumns") }),
  v.object({ type: v.literal("copyLiteratureReviewToStudio") }),
  v.object({ type: v.literal("startDeepResearch") }),
  v.object({ type: v.literal("approveDeepResearchPlan") }),
  v.object({ type: v.literal("publish") })
);

export type SeedStep = Infer<typeof seedStepValidator>;

export const seedPlanValidator = v.object({
  state: v.union(v.literal("working"), v.literal("blocked"), v.literal("done")),
  steps: v.array(seedStepValidator),
  waitingOn: v.array(v.string()),
  problems: v.array(v.string()),
});

export type SeedPlan = Infer<typeof seedPlanValidator>;

export interface PlanOptions {
  maxInFlight: number;
  publish: boolean;
}

const COMPLETED = "completed";
const FAILED = "failed";
const isFinished = (status: string) => status === COMPLETED || status === FAILED;

function researchFailed(r: NonNullable<SeedSnapshot["deepResearch"]>): boolean {
  return (
    r.planStatus === "failed" ||
    r.planStatus === "rejected" ||
    r.runStatus === "failed" ||
    r.runStatus === "cancelled"
  );
}

export function planSeed(
  notebook: ShowcaseNotebook,
  snap: SeedSnapshot,
  options: PlanOptions
): SeedPlan {
  const steps: SeedStep[] = [];
  const waitingOn: string[] = [];
  const problems: string[] = [];
  const result = (): SeedPlan => ({
    state:
      steps.length > 0 || waitingOn.length > 0
        ? "working"
        : problems.length > 0
          ? "blocked"
          : "done",
    steps,
    waitingOn,
    problems,
  });

  if (!snap.notebookExists) {
    steps.push({ type: "createNotebook" });
    return result();
  }

  // 1. Sources. Nothing is generated until every source has been read.
  const keys = new Set(snap.sources.map((s) => s.key));
  notebook.sources.forEach((source, sourceIndex) => {
    if (!keys.has(sourceKey(source))) steps.push({ type: "addSource", sourceIndex });
  });
  if (notebook.paperDiscovery) {
    const papers = snap.sources.filter((s) => s.fileType === "paper_record").length;
    if (papers < notebook.paperDiscovery.take) {
      steps.push({ type: "discoverPapers", needed: notebook.paperDiscovery.take - papers });
    }
  }
  const ingesting = snap.sources.filter((s) => !isFinished(s.status)).length;
  if (ingesting > 0) waitingOn.push(`${ingesting} source(s) ingesting`);
  for (const s of snap.sources) {
    if (s.status === FAILED) {
      problems.push(
        `Source "${s.title}" failed to ingest. Delete it in the app, then re-run the seed.`
      );
    }
  }
  if (steps.length > 0 || waitingOn.length > 0 || problems.length > 0) return result();

  // 2. Jobs already running use up slots.
  let inFlight = 0;
  for (const row of snap.studio) {
    if (row.status === FAILED) {
      problems.push(
        `${row.kind} "${row.title}" failed. Delete it in the app, then re-run the seed.`
      );
    } else if (row.status !== COMPLETED) {
      inFlight++;
      waitingOn.push(`${row.kind} "${row.title}" generating`);
    }
  }
  const review = snap.literatureReview;
  if (review && !isFinished(review.status)) inFlight++;
  const research = snap.deepResearch;
  if (research && !researchFailed(research) && research.runStatus !== COMPLETED) inFlight++;
  let queued = 0;
  const takeSlot = (): boolean => {
    if (inFlight < options.maxInFlight) {
      inFlight++;
      return true;
    }
    queued++;
    return false;
  };

  // 3. Studio items. The n-th item of a kind is started while fewer than n+1 rows of that kind
  // exist. Failed rows count too, so a failed item is only retried after someone deletes it.
  const rowsOfKind = new Map<StudioKind, number>();
  for (const row of snap.studio) rowsOfKind.set(row.kind, (rowsOfKind.get(row.kind) ?? 0) + 1);
  const ordinals = new Map<StudioKind, number>();
  notebook.studio.forEach((item, itemIndex) => {
    const ordinal = ordinals.get(item.kind) ?? 0;
    ordinals.set(item.kind, ordinal + 1);
    if (ordinal < (rowsOfKind.get(item.kind) ?? 0)) return;
    if (takeSlot()) steps.push({ type: "startStudioItem", itemIndex });
  });

  // 4. Literature review, then deep research (it starts once the review is in Studio).
  if (notebook.literatureReview) {
    if (!review) {
      if (takeSlot()) steps.push({ type: "startLiteratureReview" });
    } else if (review.awaitingColumns) {
      steps.push({ type: "confirmLiteratureReviewColumns" });
    } else if (review.status === FAILED) {
      problems.push(
        "The literature review failed. Retry it from the notebook's chat, then re-run the seed."
      );
    } else if (review.status === COMPLETED) {
      if (!review.outputsInStudio) steps.push({ type: "copyLiteratureReviewToStudio" });
    } else {
      waitingOn.push(`literature review: ${review.status}`);
    }
  }
  if (notebook.deepResearch) {
    const reviewDone =
      !notebook.literatureReview || (review?.status === COMPLETED && review.outputsInStudio);
    if (!research) {
      if (!reviewDone) {
        if (review?.status !== FAILED) {
          waitingOn.push("deep research: waiting for the literature review");
        }
      } else if (takeSlot()) {
        steps.push({ type: "startDeepResearch" });
      }
    } else if (researchFailed(research)) {
      problems.push(
        "Deep research failed. Retry it from the notebook's chat (or delete that chat thread), then re-run the seed."
      );
    } else if (research.awaitingApproval) {
      steps.push({ type: "approveDeepResearchPlan" });
    } else if (research.runStatus === COMPLETED) {
      if (!research.hasReport) {
        problems.push(
          "Deep research finished without a report. Delete its chat thread in the app, then re-run the seed."
        );
      }
    } else {
      waitingOn.push(`deep research: ${research.runStatus ?? research.planStatus}`);
    }
  }
  if (queued > 0) waitingOn.push(`${queued} item(s) queued behind running jobs`);

  // 5. Publish once nothing is left.
  if (
    options.publish &&
    steps.length === 0 &&
    waitingOn.length === 0 &&
    problems.length === 0 &&
    (!snap.isPublic || !snap.isFeatured)
  ) {
    steps.push({ type: "publish" });
  }
  return result();
}

// --- Tick decisions (`seed.ts` `tick`): pure, so they are unit-tested. ---

/** Poll interval while only waiting (or backing off), and after starting something. */
export const WAIT_TICK_MS = 60_000;
export const BUSY_TICK_MS = 10_000;
/** A chain gives up after ~4 hours of polling. */
export const MAX_TICKS = 240;

export type TickGate = { run: true } | { run: false; reason: "done" | "blocked" | "notebook_gone" };

/** Whether a tick runs its plan's steps, or the chain stops here. */
export function tickGate(plan: SeedPlan, tick: number): TickGate {
  if (plan.state === "done") return { run: false, reason: "done" };
  if (plan.state === "blocked") return { run: false, reason: "blocked" };
  // The notebook existed on an earlier tick and was deleted (a rollback): don't recreate it.
  if (tick > 1 && plan.steps.some((s) => s.type === "createNotebook")) {
    return { run: false, reason: "notebook_gone" };
  }
  return { run: true };
}

/** Delay before the next tick, or null once the chain has polled `MAX_TICKS` times. */
export function nextTickDelay(input: {
  tick: number;
  ranSteps: number;
  /** A step asked to wait (a rate-limited paper search). */
  backedOff: boolean;
}): number | null {
  if (input.tick >= MAX_TICKS) return null;
  return input.ranSteps > 0 && !input.backedOff ? BUSY_TICK_MS : WAIT_TICK_MS;
}

export type DiscoveryOutcome =
  | { kind: "added" }
  | { kind: "backoff" }
  | { kind: "error"; message: string };

/**
 * What a paper-discovery step amounted to. Any new paper is progress. A rate-limited search that
 * added nothing waits for the next tick. Otherwise it fails, saying whether the search found too
 * few papers or the DOI resolver couldn't resolve the ones it found.
 */
export function discoveryOutcome(input: {
  query: string;
  /** The manifest's pinned DOIs were resolved instead of searching. */
  pinned: boolean;
  /** Papers the search returned (or pinned DOIs looked up). */
  searched: number;
  /** Of those, papers the DOI resolver returned metadata for. */
  resolved: number;
  added: number;
  rateLimited: boolean;
}): DiscoveryOutcome {
  if (input.added > 0) return { kind: "added" };
  if (input.rateLimited) return { kind: "backoff" };
  if (input.pinned) {
    return input.resolved === 0
      ? {
          kind: "error",
          message: `None of the ${input.searched} pinned DOIs resolved (check them, or the registries were unreachable); re-run later`,
        }
      : {
          kind: "error",
          message:
            "The pinned DOIs resolved only to papers already in the notebook; check pinnedDois",
        };
  }
  const where = `Discovery for "${input.query}"`;
  if (input.searched === 0) {
    return { kind: "error", message: `${where} found no papers; widen the query or filters` };
  }
  if (input.resolved === 0) {
    return {
      kind: "error",
      message: `${where} found ${input.searched} papers, but none resolved through the DOI resolver (no DOI, or the registries were unreachable); re-run later`,
    };
  }
  return {
    kind: "error",
    message: `${where} found no papers that aren't already in the notebook; widen the query or filters`,
  };
}
