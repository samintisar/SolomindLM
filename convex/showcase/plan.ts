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
