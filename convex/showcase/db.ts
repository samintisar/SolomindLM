/**
 * Database side of the showcase seed (`seed.ts`). Internal only. Every mutation finds the owner by
 * email and the notebook by title in the owner's Showcase folder, and re-checks what exists inside
 * its own transaction, so steps can be repeated safely.
 */
import { v } from "convex/values";
import { SPREADSHEET_PRESET_REQUESTS } from "../_agents/spreadsheet/presetRequests";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import * as AudioOverviews from "../_model/audioOverviews";
import * as Flashcards from "../_model/flashcards";
import * as Infographics from "../_model/infographics";
import {
  getChatLinkedLiteratureArtifactIds,
  isChatLiteratureReport,
  isChatLiteratureTable,
} from "../_model/literatureArtifacts";
import * as Mindmaps from "../_model/mindmaps";
import * as Notebooks from "../_model/notebooks";
import * as Quizzes from "../_model/quizzes";
import * as Reports from "../_model/reports";
import * as Spreadsheets from "../_model/spreadsheets";
import * as WrittenQuestions from "../_model/writtenQuestions";
import { ingestionDelayMs } from "../documents/ingestionDelay.helpers";
import {
  deriveFulltextStatus,
  paperRecordValidator,
  primaryLinkUrlForPaper,
} from "../documents/paperRecord";
import { approveResearchPlanAndResume, startDeepResearchRun } from "../research/index";
import {
  confirmLiteratureReviewColumnsForSession,
  startLiteratureReviewRun,
} from "../studio/literature_tables/index";
import {
  SHOWCASE_FOLDER_NAME,
  SHOWCASE_NOTEBOOKS,
  type ShowcaseNotebook,
  type ShowcaseStudioItem,
  STUDIO_KINDS,
  type StudioKind,
  sourceKey,
  withPromptText,
} from "./manifest";
import { paperFileName, paperKey } from "./papers";
import { DEFAULT_MAX_IN_FLIGHT, planSeed, type SeedSnapshot, seedPlanValidator } from "./plan";

type Reader = QueryCtx["db"];

/** Read caps: a showcase notebook holds a handful of sources and Studio items. */
const MAX_ROWS = 100;

const ownerSlugArgs = { ownerEmail: v.string(), slug: v.string() };

function showcaseNotebookBySlug(slug: string): ShowcaseNotebook {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) {
    const known = SHOWCASE_NOTEBOOKS.map((n) => n.slug).join(", ");
    throw new Error(`No showcase notebook "${slug}". Known: ${known}`);
  }
  return notebook;
}

export async function ownerByEmail(db: Reader, email: string): Promise<Doc<"users">> {
  const user = await db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email.trim()))
    .first();
  if (!user) {
    throw new Error(`No user with email ${email} on this deployment. Sign up with it first.`);
  }
  return user;
}

async function findShowcaseFolder(db: Reader, userId: Id<"users">): Promise<Doc<"folders"> | null> {
  for await (const folder of db
    .query("folders")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (folder.name === SHOWCASE_FOLDER_NAME) return folder;
  }
  return null;
}

async function findShowcaseNotebook(
  db: Reader,
  userId: Id<"users">,
  title: string
): Promise<Doc<"notebooks"> | null> {
  const folder = await findShowcaseFolder(db, userId);
  if (!folder) return null;
  for await (const notebook of db
    .query("notebooks")
    .withIndex("by_folder", (q) => q.eq("folderId", folder._id))) {
    if (notebook.userId === userId && notebook.title === title) return notebook;
  }
  return null;
}

async function requireShowcaseNotebook(ctx: QueryCtx, ownerEmail: string, slug: string) {
  const spec = showcaseNotebookBySlug(slug);
  const owner = await ownerByEmail(ctx.db, ownerEmail);
  const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
  if (!notebook) {
    throw new Error(`"${spec.title}" doesn't exist yet; run the seed from the start.`);
  }
  return { spec, owner, notebook };
}

async function listDocuments(db: Reader, notebookId: Id<"notebooks">) {
  return await db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .take(MAX_ROWS);
}

function documentKey(doc: Doc<"documents">): string {
  if (doc.fileType === "paper_record") {
    return paperKey({ title: doc.fileName, paperRecord: doc.paperRecord });
  }
  if (doc.fileType === "url" || doc.fileType === "youtube") return doc.fileUrl ?? doc.fileName;
  return doc.fileName;
}

type StudioRow = { status: string; title: string };

/** The owner's rows of one Studio kind (rows saved from a literature table/report don't count). */
async function studioRows(
  db: Reader,
  kind: StudioKind,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<StudioRow[]> {
  switch (kind) {
    case "report":
      return (
        await db
          .query("reports")
          .withIndex("by_notebook_and_user", (q) =>
            q.eq("notebookId", notebookId).eq("userId", userId)
          )
          .take(MAX_ROWS)
      ).filter((r) => !r.metadata?.sourceLiteratureReportId);
    case "flashcards":
      return await db
        .query("flashcards")
        .withIndex("by_notebook_and_user", (q) =>
          q.eq("notebookId", notebookId).eq("userId", userId)
        )
        .take(MAX_ROWS);
    case "quiz":
      return await db
        .query("quizzes")
        .withIndex("by_notebook_and_user", (q) =>
          q.eq("notebookId", notebookId).eq("userId", userId)
        )
        .take(MAX_ROWS);
    case "writtenQuestions":
      return await db
        .query("writtenQuestions")
        .withIndex("by_notebook_and_user", (q) =>
          q.eq("notebookId", notebookId).eq("userId", userId)
        )
        .take(MAX_ROWS);
    case "mindmap":
      return await db
        .query("mindmaps")
        .withIndex("by_notebook_and_user", (q) =>
          q.eq("notebookId", notebookId).eq("userId", userId)
        )
        .take(MAX_ROWS);
    case "audio":
      return await db
        .query("audioOverviews")
        .withIndex("by_notebook_and_user", (q) =>
          q.eq("notebookId", notebookId).eq("userId", userId)
        )
        .take(MAX_ROWS);
    case "infographic":
      return await db
        .query("infographics")
        .withIndex("by_notebook_and_user", (q) =>
          q.eq("notebookId", notebookId).eq("userId", userId)
        )
        .take(MAX_ROWS);
    case "spreadsheet":
      return (
        await db
          .query("spreadsheets")
          .withIndex("by_notebook_and_user", (q) =>
            q.eq("notebookId", notebookId).eq("userId", userId)
          )
          .take(MAX_ROWS)
      ).filter((r) => !r.metadata?.sourceLiteratureTableId);
  }
}

/** True while a workflow is paused in `awaitEvent` (its tracked "awaiting_user_input" step is open). */
async function isAwaitingUserInput(db: Reader, researchId: string): Promise<boolean> {
  const step = await db
    .query("researchSteps")
    .withIndex("by_research_step", (q) =>
      q.eq("researchId", researchId).eq("stepType", "awaiting_user_input")
    )
    .first();
  return step?.status === "in_progress";
}

/** The owner's newest literature review in this notebook; editors' reviews are never touched. */
async function latestReviewSession(
  db: Reader,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Doc<"literatureReviewSessions"> | null> {
  const sessions = await db
    .query("literatureReviewSessions")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .order("desc")
    .take(MAX_ROWS);
  return sessions.find((s) => s.userId === userId) ?? null;
}

/** Title prefixes `isChatLiteratureTable/Report` read as chat output ("Literature table —", "Report -"). */
const CHAT_TITLE_PREFIX = {
  table: /^literature table\s*[—-]\s*/i,
  report: /^report\s*[—-]\s*/i,
} as const;

const PLAIN_TITLE = { table: "Literature Review: Evidence Table", report: "Literature Review" };

/**
 * The Studio copy's title: the review's title without a chat-output prefix, so Studio lists the
 * copy (and `reviewOutputsInStudio` finds it). A title that is only the prefix gets a plain one.
 */
function studioCopyTitle(title: string, kind: "table" | "report"): string {
  let clean = title.trim();
  while (CHAT_TITLE_PREFIX[kind].test(clean)) {
    clean = clean.replace(CHAT_TITLE_PREFIX[kind], "").trim();
  }
  return clean || PLAIN_TITLE[kind];
}

/** A Studio-visible copy of the session's table and report exists. */
async function reviewOutputsInStudio(
  ctx: QueryCtx,
  session: Doc<"literatureReviewSessions">
): Promise<boolean> {
  if (!session.tableId || !session.reportId) return false;
  const table = await ctx.db.get("literatureTables", session.tableId);
  const report = await ctx.db.get("literatureReports", session.reportId);
  if (!table || !report) return false;
  const tableTitle = studioCopyTitle(table.title, "table");
  const reportTitle = studioCopyTitle(report.title, "report");
  const chat = await getChatLinkedLiteratureArtifactIds(ctx, session.notebookId);
  const tables = await ctx.db
    .query("literatureTables")
    .withIndex("by_notebook", (q) => q.eq("notebookId", session.notebookId))
    .take(MAX_ROWS);
  const reports = await ctx.db
    .query("literatureReports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", session.notebookId))
    .take(MAX_ROWS);
  return (
    tables.some((t) => t.title === tableTitle && !isChatLiteratureTable(t, chat.tableIds)) &&
    reports.some((r) => r.title === reportTitle && !isChatLiteratureReport(r, chat.reportIds))
  );
}

/**
 * The owner's newest deep-research plan in this notebook. Plans hang off conversations; only the
 * owner's own threads are read (newest first), so viewers' private threads on a public notebook
 * can't push the plan out of the read window.
 */
async function latestResearchPlan(
  db: Reader,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Doc<"researchPlans"> | null> {
  let latest: Doc<"researchPlans"> | null = null;
  const conversations = await db
    .query("conversations")
    .withIndex("by_user_notebook_and_updatedAt", (q) =>
      q.eq("userId", userId).eq("notebookId", notebookId)
    )
    .order("desc")
    .take(MAX_ROWS);
  for (const conversation of conversations) {
    const plans = await db
      .query("researchPlans")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .take(MAX_ROWS);
    for (const plan of plans) {
      if (plan.notebookId === notebookId && (!latest || plan.createdAt > latest.createdAt)) {
        latest = plan;
      }
    }
  }
  return latest;
}

const EMPTY_SNAPSHOT: SeedSnapshot = {
  notebookExists: false,
  isPublic: false,
  isFeatured: false,
  sources: [],
  studio: [],
  literatureReview: null,
  deepResearch: null,
};

async function loadSeedState(ctx: QueryCtx, ownerEmail: string, slug: string) {
  const spec = showcaseNotebookBySlug(slug);
  const owner = await ownerByEmail(ctx.db, ownerEmail);
  const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
  if (!notebook) return { spec, owner, notebook, snapshot: EMPTY_SNAPSHOT };

  const documents = await listDocuments(ctx.db, notebook._id);
  const studio: SeedSnapshot["studio"] = [];
  for (const kind of STUDIO_KINDS) {
    for (const row of await studioRows(ctx.db, kind, notebook._id, owner._id)) {
      studio.push({ kind, title: row.title, status: row.status });
    }
  }

  const session = await latestReviewSession(ctx.db, notebook._id, owner._id);
  const plan = await latestResearchPlan(ctx.db, notebook._id, owner._id);
  const run = plan
    ? await ctx.db
        .query("researchRuns")
        .withIndex("by_planId_and_createdAt", (q) => q.eq("planId", plan._id))
        .order("desc")
        .first()
    : null;

  const snapshot: SeedSnapshot = {
    notebookExists: true,
    isPublic: notebook.isPublic === true,
    isFeatured: notebook.isFeatured === true,
    sources: documents.map((d) => ({
      key: documentKey(d),
      title: d.fileName,
      fileType: d.fileType,
      status: d.status,
    })),
    studio,
    literatureReview: session
      ? {
          status: session.status,
          awaitingColumns:
            session.status === "awaiting_columns" &&
            (await isAwaitingUserInput(ctx.db, session._id)),
          outputsInStudio:
            session.status === "completed" && (await reviewOutputsInStudio(ctx, session)),
        }
      : null,
    deepResearch: plan
      ? {
          planStatus: plan.status,
          awaitingApproval:
            plan.status === "draft" && (await isAwaitingUserInput(ctx.db, plan._id)),
          runStatus: run?.status,
          hasReport: Boolean(run?.reportId),
        }
      : null,
  };
  return { spec, owner, notebook, snapshot };
}

/** Throws unless the owner has an account here. */
export const assertOwner = internalQuery({
  args: { ownerEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ownerByEmail(ctx.db, args.ownerEmail);
    return null;
  },
});

/** What `tick` needs: the plan and the keys of the papers already added. */
export const getSeedState = internalQuery({
  args: { ...ownerSlugArgs, publish: v.boolean(), maxInFlight: v.number() },
  returns: v.object({ plan: seedPlanValidator, paperKeys: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { spec, snapshot } = await loadSeedState(ctx, args.ownerEmail, args.slug);
    return {
      plan: planSeed(spec, snapshot, { publish: args.publish, maxInFlight: args.maxInFlight }),
      paperKeys: snapshot.sources.filter((s) => s.fileType === "paper_record").map((s) => s.key),
    };
  },
});

/** Progress of every showcase notebook (or one): `npx convex run showcase/db:seedStatus`. */
export const seedStatus = internalQuery({
  args: { ownerEmail: v.string(), slug: v.optional(v.string()) },
  returns: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      notebookId: v.union(v.id("notebooks"), v.null()),
      isPublic: v.boolean(),
      state: v.string(),
      nextSteps: v.array(v.string()),
      waitingOn: v.array(v.string()),
      problems: v.array(v.string()),
      /** Paper sources as "doi:… | title", to pin into the manifest after the dev run. */
      papers: v.array(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const specs = args.slug ? [showcaseNotebookBySlug(args.slug)] : SHOWCASE_NOTEBOOKS;
    const rows = [];
    for (const spec of specs) {
      const { notebook, snapshot } = await loadSeedState(ctx, args.ownerEmail, spec.slug);
      const plan = planSeed(spec, snapshot, {
        publish: false,
        maxInFlight: DEFAULT_MAX_IN_FLIGHT,
      });
      rows.push({
        slug: spec.slug,
        title: spec.title,
        notebookId: notebook?._id ?? null,
        isPublic: snapshot.isPublic,
        state: plan.state,
        nextSteps: plan.steps.map((s) => s.type),
        waitingOn: plan.waitingOn,
        problems: plan.problems,
        papers: snapshot.sources
          .filter((s) => s.fileType === "paper_record")
          .map((s) => `${s.key} | ${s.title}`),
      });
    }
    return rows;
  },
});

export const ensureNotebook = internalMutation({
  args: ownerSlugArgs,
  returns: v.id("notebooks"),
  handler: async (ctx, args) => {
    const spec = showcaseNotebookBySlug(args.slug);
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const existing = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
    if (existing) return existing._id;
    const now = Date.now();
    const folderId =
      (await findShowcaseFolder(ctx.db, owner._id))?._id ??
      (await ctx.db.insert("folders", {
        userId: owner._id,
        name: SHOWCASE_FOLDER_NAME,
        icon: "Folder",
        createdAt: now,
        updatedAt: now,
      }));
    const notebookId = await Notebooks.createNotebook(ctx, {
      userId: owner._id,
      title: spec.title,
      icon: spec.icon,
      coverColor: spec.coverColor,
      folderId,
    });
    if (spec.chatMode === "learningGuide") {
      await Notebooks.updateNotebook(ctx, notebookId, {
        chatSettings: { instructionMode: "learningGuide", responseLength: "default" },
      });
    }
    return notebookId;
  },
});

async function hasDocumentWithKey(db: Reader, notebookId: Id<"notebooks">, key: string) {
  return (await listDocuments(db, notebookId)).some((d) => documentKey(d) === key);
}

/** Schedules ingestion with the same delay `documents.upload` uses (YouTube jobs staggered). */
async function scheduleIngestion(
  ctx: MutationCtx,
  fileType: string,
  documentId: Id<"documents">,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
) {
  await ctx.scheduler.runAfter(
    ingestionDelayMs(fileType),
    internal.documents.embeddingJob.docEmbedding,
    { documentId, userId, notebookId }
  );
}

/** A web page, YouTube video or pasted text, shaped like `documents.upload` writes it. */
export const addSource = internalMutation({
  args: { ...ownerSlugArgs, sourceIndex: v.number() },
  returns: v.union(v.id("documents"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(
      ctx,
      args.ownerEmail,
      args.slug
    );
    const source = spec.sources[args.sourceIndex];
    if (!source) throw new Error(`"${spec.title}" has no source ${args.sourceIndex}`);
    if (source.kind === "file") {
      throw new Error("File sources are fetched by the seed; use attachFileSource");
    }
    if (await hasDocumentWithKey(ctx.db, notebook._id, sourceKey(source))) return null;
    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      userId: owner._id,
      notebookId: notebook._id,
      fileName: source.title,
      fileType: source.kind,
      // Pasted text lives in fileUrl, as documents.upload stores it.
      fileUrl: source.kind === "text" ? source.text : source.url,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleIngestion(ctx, source.kind, documentId, owner._id, notebook._id);
    return documentId;
  },
});

/** A PDF the seed action fetched and stored; deletes the upload if the source already exists. */
export const attachFileSource = internalMutation({
  args: { ...ownerSlugArgs, sourceIndex: v.number(), storageId: v.id("_storage") },
  returns: v.union(v.id("documents"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(
      ctx,
      args.ownerEmail,
      args.slug
    );
    const source = spec.sources[args.sourceIndex];
    if (source?.kind !== "file") {
      throw new Error(`"${spec.title}" source ${args.sourceIndex} is not a file`);
    }
    if (await hasDocumentWithKey(ctx.db, notebook._id, sourceKey(source))) {
      await ctx.storage.delete(args.storageId);
      return null;
    }
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new Error("Stored file not found");
    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      userId: owner._id,
      notebookId: notebook._id,
      fileName: source.fileName,
      fileType: "file",
      fileSize: file.size,
      storageId: args.storageId,
      contentType: "application/pdf",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleIngestion(ctx, "file", documentId, owner._id, notebook._id);
    return documentId;
  },
});

/**
 * Discovered papers, shaped like the Discover dialog adds them (`documents.upload` with
 * `paper_record`), plus `fullTextPolicy` so only openly licensed full text is kept. Returns how
 * many were added; stops at the manifest's `take`.
 */
export const addDiscoveredPapers = internalMutation({
  args: {
    ...ownerSlugArgs,
    papers: v.array(v.object({ title: v.string(), paperRecord: paperRecordValidator })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(
      ctx,
      args.ownerEmail,
      args.slug
    );
    if (!spec.paperDiscovery) throw new Error(`"${spec.title}" has no paper discovery`);
    const existing = (await listDocuments(ctx.db, notebook._id)).filter(
      (d) => d.fileType === "paper_record"
    );
    const keys = new Set(existing.map(documentKey));
    let count = existing.length;
    let added = 0;
    for (const paper of args.papers) {
      if (count >= spec.paperDiscovery.take) break;
      const key = paperKey(paper);
      if (keys.has(key)) continue;
      keys.add(key);
      const pr = paper.paperRecord;
      const now = Date.now();
      const documentId = await ctx.db.insert("documents", {
        userId: owner._id,
        notebookId: notebook._id,
        fileName: paperFileName(paper.title),
        fileType: "paper_record",
        fileUrl: primaryLinkUrlForPaper(pr) || undefined,
        status: "pending",
        paperRecord: pr,
        fulltextStatus: deriveFulltextStatus(pr),
        ingestionStatus: "pending",
        fullTextPolicy: "open_license_only",
        createdAt: now,
        updatedAt: now,
      });
      await scheduleIngestion(ctx, "paper_record", documentId, owner._id, notebook._id);
      count++;
      added++;
    }
    return added;
  },
});

type StartBase = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
};

/**
 * Creates the Studio row and schedules its job: the same rows and job args as the app's
 * `studio/scheduling/*` actions and `generate*` mutations, without auth and daily limits.
 */
async function startStudioJob(
  ctx: MutationCtx,
  base: StartBase,
  item: ShowcaseStudioItem
): Promise<string> {
  const { userId, notebookId, documentIds } = base;
  switch (item.kind) {
    case "report": {
      const reportId = await Reports.createReport(ctx, {
        userId,
        notebookId,
        title: "Report",
        reportType: item.reportType,
        metadata: { status: "generating", documentIds },
      });
      await ctx.scheduler.runAfter(0, internal.studio.reports.job.reportGeneration, {
        reportId,
        userId,
        notebookId,
        documentIds,
        reportType: item.reportType,
        customPrompt: item.prompt,
      });
      return reportId;
    }
    case "flashcards": {
      const flashcardId = await Flashcards.createFlashcard(ctx, {
        userId,
        notebookId,
        title: "Flashcards",
        metadata: {
          difficulty: item.difficulty,
          cardCount: item.cardCount,
          topic: item.topic,
          documentIds,
        },
      });
      await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.flashcardGeneration, {
        flashcardId,
        userId,
        notebookId,
        documentIds,
        cardCount: item.cardCount,
        difficulty: item.difficulty,
        topic: item.topic,
      });
      return flashcardId;
    }
    case "quiz": {
      const quizId = await Quizzes.createQuiz(ctx, {
        userId,
        notebookId,
        title: "Quiz",
        metadata: {
          difficulty: item.difficulty,
          questionCount: item.questionCount,
          focus: item.focus,
          documentIds,
        },
      });
      await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.quizGeneration, {
        quizId,
        userId,
        notebookId,
        documentIds,
        questionCount: item.questionCount,
        difficulty: item.difficulty,
        focus: item.focus,
      });
      return quizId;
    }
    case "writtenQuestions": {
      const writtenQuestionId = await WrittenQuestions.createWrittenQuestion(ctx, {
        userId,
        notebookId,
        title: "Written Questions",
        questionType: item.questionType,
        metadata: {
          difficulty: item.difficulty,
          questionCount: item.questionCount,
          focus: item.focus,
          documentIds,
        },
      });
      await ctx.scheduler.runAfter(
        0,
        internal.studio.writtenQuestions.job.writtenQuestionsGeneration,
        {
          writtenQuestionId,
          userId,
          notebookId,
          documentIds,
          questionCount: item.questionCount,
          difficulty: item.difficulty,
          questionType: item.questionType,
          focus: item.focus,
        }
      );
      return writtenQuestionId;
    }
    case "mindmap": {
      const mindmapId = await Mindmaps.createMindmap(ctx, {
        userId,
        notebookId,
        title: "Mind Map",
        data: {},
        metadata: { documentIds },
        status: "generating",
      });
      await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.mindmapGeneration, {
        mindmapId,
        userId,
        notebookId,
        documentIds,
        customPrompt: item.prompt,
      });
      return mindmapId;
    }
    case "audio": {
      const audioOverviewId = await AudioOverviews.createAudioOverview(ctx, {
        userId,
        notebookId,
        title: "Audio Overview",
        metadata: { audioType: item.audioType, length: item.length, focus: item.focus },
        status: "generating",
      });
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.audioOverviewGeneration, {
        audioOverviewId,
        userId,
        notebookId,
        documentIds,
      });
      return audioOverviewId;
    }
    case "infographic": {
      const infographicId = await Infographics.createInfographic(ctx, {
        userId,
        notebookId,
        title: "Infographic",
        data: {},
        metadata: {
          customPrompt: item.prompt,
          sourceDocumentIds: documentIds,
          orientation: item.orientation,
          detailLevel: item.detailLevel,
        },
        status: "generating",
      });
      await ctx.scheduler.runAfter(
        0,
        internal.studio.infographic.generate.generateInfographicImage,
        {
          infographicId,
          userId,
          notebookId,
          documentIds,
          customPrompt: item.prompt,
          orientation: item.orientation,
          detailLevel: item.detailLevel,
        }
      );
      return infographicId;
    }
    case "spreadsheet": {
      // A preset sends its whole-table request, as the Create spreadsheet dialog does.
      const customPrompt =
        item.spreadsheetType === "custom"
          ? (item.prompt ?? "")
          : SPREADSHEET_PRESET_REQUESTS[item.spreadsheetType];
      const spreadsheetId = await Spreadsheets.createSpreadsheet(ctx, {
        userId,
        notebookId,
        title: "Spreadsheet",
        metadata: {
          spreadsheetType: item.spreadsheetType,
          customPrompt,
          status: "generating",
          documentIds,
        },
      });
      await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.spreadsheetGeneration, {
        spreadsheetId,
        userId,
        notebookId,
        documentIds,
        spreadsheetType: item.spreadsheetType,
        customPrompt,
      });
      return spreadsheetId;
    }
  }
}

/** Starts manifest Studio item `itemIndex` unless a row for it exists (failed rows count). */
export const startStudioItem = internalMutation({
  args: { ...ownerSlugArgs, itemIndex: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(
      ctx,
      args.ownerEmail,
      args.slug
    );
    const item = spec.studio[args.itemIndex];
    if (!item) throw new Error(`"${spec.title}" has no Studio item ${args.itemIndex}`);
    const ordinal = spec.studio.slice(0, args.itemIndex).filter((i) => i.kind === item.kind).length;
    const existing = (await studioRows(ctx.db, item.kind, notebook._id, owner._id)).length;
    if (existing > ordinal) return null;
    if (existing < ordinal) {
      throw new Error(
        `Start "${spec.title}" ${item.kind} items in manifest order (${existing} exist, this is #${ordinal + 1})`
      );
    }
    const documentIds = (await listDocuments(ctx.db, notebook._id))
      .filter((d) => d.status === "completed")
      .map((d) => d._id);
    if (documentIds.length === 0) throw new Error(`"${spec.title}" has no ingested sources yet`);
    return await startStudioJob(
      ctx,
      { userId: owner._id, notebookId: notebook._id, documentIds },
      withPromptText(item)
    );
  },
});

/** Starts the manifest's literature review over the notebook's papers (once). */
export const startShowcaseLiteratureReview = internalMutation({
  args: ownerSlugArgs,
  returns: v.union(v.id("literatureReviewSessions"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(
      ctx,
      args.ownerEmail,
      args.slug
    );
    const review = spec.literatureReview;
    if (!review) throw new Error(`"${spec.title}" has no literature review`);
    if (await latestReviewSession(ctx.db, notebook._id, owner._id)) return null;
    await assertCanEditNotebook(ctx, notebook._id, owner._id);
    const documentIds = (await listDocuments(ctx.db, notebook._id))
      .filter((d) => d.fileType === "paper_record" && d.status === "completed")
      .map((d) => d._id);
    const { sessionId } = await startLiteratureReviewRun(ctx, owner._id, {
      query: review.question,
      notebookId: notebook._id,
      searchOptions: {
        researchDatabase: review.researchDatabase,
        ...(review.academicFilters ? { academicFilters: review.academicFilters } : {}),
      },
      documentIds,
      paperScope: "papers_and_search",
    });
    return sessionId;
  },
});

/** Accepts the planner's suggested columns, as the owner would in the column picker. */
export const confirmShowcaseLiteratureReview = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const session = await latestReviewSession(ctx.db, notebook._id, owner._id);
    if (!session || session.status !== "awaiting_columns") return null;
    if (!(await isAwaitingUserInput(ctx.db, session._id))) return null;
    const columns = session.suggestedColumns ?? [];
    if (columns.length === 0) throw new Error("The review has no suggested columns to confirm");
    await confirmLiteratureReviewColumnsForSession(
      ctx,
      session,
      columns.map((c) => ({
        id: c.id,
        name: c.name,
        isVisible: c.isVisible,
        ...(c.instructions ? { instructions: c.instructions } : {}),
      }))
    );
    return null;
  },
});

/**
 * Copies the finished review's table and report into Studio: new rows without a session id
 * (the fields `performNotebookFork` copies), so viewers can open them and forks keep them.
 */
export const copyLiteratureReviewToStudio = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const session = await latestReviewSession(ctx.db, notebook._id, owner._id);
    if (!session || session.status !== "completed" || !session.tableId || !session.reportId) {
      throw new Error("The literature review hasn't finished");
    }
    if (await reviewOutputsInStudio(ctx, session)) return null;
    const table = await ctx.db.get("literatureTables", session.tableId);
    const report = await ctx.db.get("literatureReports", session.reportId);
    if (!table || !report) throw new Error("The review's table or report is missing");
    const now = Date.now();
    const tableId = await ctx.db.insert("literatureTables", {
      title: studioCopyTitle(table.title, "table"),
      description: table.description,
      notebookId: notebook._id,
      userId: table.userId,
      status: "completed",
      columns: table.columns,
      papers: table.papers,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("literatureReports", {
      title: studioCopyTitle(report.title, "report"),
      notebookId: notebook._id,
      userId: report.userId,
      status: "completed",
      content: report.content,
      citationStyle: report.citationStyle,
      sections: report.sections,
      citationIds: report.citationIds,
      tableId,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Starts the manifest's deep research (once). Its table and report land in Studio by themselves. */
export const startShowcaseDeepResearch = internalMutation({
  args: ownerSlugArgs,
  returns: v.union(v.id("researchPlans"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(
      ctx,
      args.ownerEmail,
      args.slug
    );
    const research = spec.deepResearch;
    if (!research) throw new Error(`"${spec.title}" has no deep research`);
    if (await latestResearchPlan(ctx.db, notebook._id, owner._id)) return null;
    await assertCanEditNotebook(ctx, notebook._id, owner._id);
    const { planId } = await startDeepResearchRun(ctx, owner._id, {
      notebookId: notebook._id,
      query: research.query,
      sourcePolicy: { channels: [...research.channels] },
    });
    return planId;
  },
});

/** Approves the plan unchanged, as the owner would with "Start research". */
export const approveShowcaseDeepResearch = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const plan = await latestResearchPlan(ctx.db, notebook._id, owner._id);
    if (!plan || plan.status !== "draft" || !(await isAwaitingUserInput(ctx.db, plan._id))) {
      return null;
    }
    await approveResearchPlanAndResume(ctx, plan);
    return null;
  },
});

/** Public + featured, only once everything in the manifest exists and finished. */
export const publishShowcaseNotebook = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { spec, notebook, snapshot } = await loadSeedState(ctx, args.ownerEmail, args.slug);
    const plan = planSeed(spec, snapshot, { publish: true, maxInFlight: DEFAULT_MAX_IN_FLIGHT });
    if (
      !notebook ||
      plan.steps.some((s) => s.type !== "publish") ||
      plan.waitingOn.length > 0 ||
      plan.problems.length > 0
    ) {
      const reasons =
        [...plan.waitingOn, ...plan.problems].join("; ") ||
        plan.steps.map((s) => s.type).join(", ");
      throw new Error(`"${spec.title}" isn't finished: ${reasons}`);
    }
    await ctx.db.patch("notebooks", notebook._id, {
      isPublic: true,
      isFeatured: true,
      // Re-publishing keeps the original date, as notebooks.public.setPublic does.
      ...(notebook.isPublic ? {} : { publishedAt: Date.now() }),
    });
    return null;
  },
});

/**
 * Deletes up to `limit` chunks of one of the owner's showcase sources and returns how many it
 * deleted. A large source's chunks (with embeddings) exceed one mutation's read limit, so the
 * app's delete fails on it; call this until it returns 0, then delete the source in the app.
 */
export const deleteShowcaseDocumentChunks = internalMutation({
  args: { ownerEmail: v.string(), documentId: v.id("documents"), limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const document = await ctx.db.get("documents", args.documentId);
    if (!document || document.userId !== owner._id) {
      throw new Error("Not one of the owner's documents");
    }
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .take(Math.min(args.limit ?? 100, 200));
    for (const chunk of chunks) await ctx.db.delete(chunk._id);
    return chunks.length;
  },
});

/**
 * Clears the owner's unfinished literature review (e.g. one stuck waiting for columns it never
 * suggested), so the next seed run starts it again. A finished review is never touched.
 */
export const resetShowcaseLiteratureReview = internalMutation({
  args: ownerSlugArgs,
  returns: v.union(v.id("literatureReviewSessions"), v.null()),
  handler: async (ctx, args) => {
    const { owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const session = await latestReviewSession(ctx.db, notebook._id, owner._id);
    if (!session) return null;
    if (session.status === "completed") throw new Error("The literature review has finished");
    await ctx.db.delete("literatureReviewSessions", session._id);
    return session._id;
  },
});

/** Read cap for the pending-ticks scan: one chain per notebook, plus a few overlapping re-runs. */
const MAX_PENDING_SCAN = 1000;

/**
 * Stops every seed chain: cancels the pending `tick`s (all, or one slug's). Jobs a tick already
 * started keep running; re-run `seedShowcase` to continue.
 */
export const stopSeed = internalMutation({
  args: { slug: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const pending = await ctx.db.system
      .query("_scheduled_functions")
      .withIndex("by_creation_time")
      .order("desc")
      .take(MAX_PENDING_SCAN);
    let cancelled = 0;
    for (const job of pending) {
      if (job.state.kind !== "pending" || !job.name.startsWith("showcase/seed")) continue;
      const tickArgs = job.args[0] as { slug?: string } | undefined;
      if (args.slug && tickArgs?.slug !== args.slug) continue;
      await ctx.scheduler.cancel(job._id);
      cancelled++;
    }
    return cancelled;
  },
});

/** Rollback step 1: take showcase notebooks off the Public tab (all, or one slug). */
export const unpublishShowcase = internalMutation({
  args: { ownerEmail: v.string(), slug: v.optional(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const specs = args.slug ? [showcaseNotebookBySlug(args.slug)] : SHOWCASE_NOTEBOOKS;
    const changed: string[] = [];
    for (const spec of specs) {
      const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
      if (!notebook || (!notebook.isPublic && !notebook.isFeatured)) continue;
      await ctx.db.patch("notebooks", notebook._id, {
        isPublic: false,
        isFeatured: false,
        publishedAt: undefined,
      });
      changed.push(spec.title);
    }
    return changed;
  },
});

/**
 * Rollback step 2: delete one showcase notebook the way the app's Delete does
 * (`removeNotebookWithRelated`: members, share links, the notebook row). `confirmTitle` must match.
 */
export const deleteShowcaseNotebook = internalMutation({
  args: { ...ownerSlugArgs, confirmTitle: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const spec = showcaseNotebookBySlug(args.slug);
    if (args.confirmTitle !== spec.title) {
      throw new Error(`confirmTitle must be exactly "${spec.title}"`);
    }
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
    if (!notebook) return null;
    await Notebooks.removeNotebookWithRelated(ctx, notebook._id);
    return null;
  },
});
