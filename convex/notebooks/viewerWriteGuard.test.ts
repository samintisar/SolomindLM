/// <reference types="vite/client" />
/**
 * A viewer (any signed-in non-member of a public notebook) may read it, chat in their own threads
 * and fork it, but must not change anything the owner sees. Each row below calls one public
 * mutation or action the web app uses, as a viewer, on the owner's notebook or one of its rows,
 * and expects an access refusal.
 *
 * Deliberately not listed, because viewers may call them: forkPublic, getSignedUrl,
 * getSourceSuggestions, generateSourceGuide (fills a shared cache on the source; charged to the
 * caller's own daily limit), createConversation / sendMessageOptimistic / releaseChatGeneration
 * (the viewer's own private thread), transcribeChatAudio (the viewer's own recording).
 *
 * Not listed because they take no notebook, source or studio id: generateUploadUrl, resolveDoi,
 * parseBibliography, redeemCollaborateLink / forkNotebookFromToken (need a token the owner made),
 * and the account, billing, folders, onboarding, feedback, prompts, preferences, push and eval
 * modules. setFeatured and adminUnpublish are admin-only and covered in public.test.ts.
 *
 * No action had to be skipped for needing the network: each one listed checks access first. The
 * viewer is on Pro so that no plan gate refuses a call before its access check runs.
 */
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./notebooks/index.ts",
  "./documents/index.ts",
  "./studio/scheduling/reports.ts",
  "./studio/writtenQuestions/grading.ts",
]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

/**
 * Every refusal names missing access, or hides the row: the owner's notebook (to the owner-only
 * calls) and conversation read as "not found" to anyone else.
 */
const ACCESS_REFUSED = /Access denied|Not authorized|Notebook not found|Conversation not found/;

async function seed() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Owner" });
    const viewer = await ctx.db.insert("users", { name: "Viewer" });
    // A Pro viewer, so no plan gate refuses a call before its access check would.
    await ctx.db.insert("stripeSubscriptions", {
      userId: viewer,
      stripeSubscriptionId: "sub_viewer",
      stripeCustomerId: "cus_viewer",
      stripePriceId: "price_pro",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
      interval: "month",
      amount: 1500,
      currency: "usd",
      createdAt: now,
      updatedAt: now,
    });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Public",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    });
    const owned = { userId: owner, notebookId, createdAt: now, updatedAt: now };
    const storageId = await ctx.storage.store(new Blob(["%PDF-1.7"]));
    // The viewer's own fresh upload, which attachPdf would put on the owner's source.
    const uploadId = await ctx.storage.store(new Blob(["%PDF-1.7 viewer"]));
    const documentId = await ctx.db.insert("documents", {
      ...owned,
      fileName: "paper.pdf",
      fileType: "paper_record",
      storageId,
      status: "completed",
      paperRecord: { abstract: "A", authors: ["A"], doi: "10.1/x", isOa: false },
    });
    const conversationId = await ctx.db.insert("conversations", owned);
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: "Owner's question",
      createdAt: now,
    });
    const noteId = await ctx.db.insert("notes", {
      ...owned,
      type: "manual",
      title: "Owner's note",
      status: "completed",
      content: "Private thoughts",
    });
    const reportId = await ctx.db.insert("reports", { ...owned, title: "R", status: "completed" });
    const flashcardId = await ctx.db.insert("flashcards", {
      ...owned,
      title: "F",
      status: "completed",
      cardsData: [{ front: "Q", back: "A" }],
    });
    const quizId = await ctx.db.insert("quizzes", {
      ...owned,
      title: "Q",
      status: "completed",
      questionsData: [{ question: "Q", options: ["a", "b"], correctAnswer: 0 }],
    });
    const mindmapId = await ctx.db.insert("mindmaps", {
      ...owned,
      title: "M",
      data: {},
      status: "completed",
    });
    const audioId = await ctx.db.insert("audioOverviews", {
      ...owned,
      title: "A",
      status: "completed",
    });
    const infographicId = await ctx.db.insert("infographics", {
      ...owned,
      title: "I",
      data: {},
      status: "completed",
    });
    const spreadsheetId = await ctx.db.insert("spreadsheets", {
      ...owned,
      title: "S",
      data: "",
      status: "completed",
    });
    const writtenId = await ctx.db.insert("writtenQuestions", {
      ...owned,
      title: "W",
      status: "completed",
      questionType: "short",
      questionsData: [{ id: "q1", question: "Why?" }],
    });
    const shareLinkId = await ctx.db.insert("notebookShareLinks", {
      notebookId,
      kind: "collaborate",
      tokenHash: "hash",
      createdByUserId: owner,
      createdAt: now,
    });
    const planId = await ctx.db.insert("researchPlans", {
      ...owned,
      conversationId,
      messageId,
      query: "q",
      subQuestions: [],
      sourcePolicy: { channels: ["web"] },
      status: "draft",
    });
    const sessionId = await ctx.db.insert("literatureReviewSessions", {
      ...owned,
      query: "q",
      workflowId: "wf",
      status: "awaiting_columns",
    });
    const literatureTableId = await ctx.db.insert("literatureTables", {
      ...owned,
      title: "T",
      status: "completed",
      columns: [],
      papers: [],
    });
    const literatureReportId = await ctx.db.insert("literatureReports", {
      ...owned,
      title: "LR",
      status: "completed",
      content: "# R",
      citationStyle: "apa7",
      sections: [],
      citationIds: [],
    });
    return {
      viewer,
      notebookId,
      uploadId,
      documentId,
      conversationId,
      messageId,
      noteId,
      reportId,
      flashcardId,
      quizId,
      mindmapId,
      audioId,
      infographicId,
      spreadsheetId,
      writtenId,
      shareLinkId,
      planId,
      sessionId,
      literatureTableId,
      literatureReportId,
    };
  });
  const asViewer = t.withIdentity({ subject: `${ids.viewer as string}|session1` });
  return { t, asViewer, ...ids };
}

type Seeded = Awaited<ReturnType<typeof seed>>;
/**
 * A call that must be refused. Most refusals throw; the few that report a refusal in their
 * return value instead give `refusal`, the value they must resolve to.
 */
type Case = [name: string, call: (s: Seeded) => Promise<unknown>, refusal?: unknown];

const cases: Case[] = [
  // Notebook
  [
    "notebooks.update",
    (s) => s.asViewer.mutation(api.notebooks.index.update, { id: s.notebookId, title: "Mine" }),
  ],
  [
    "notebooks.update (chat settings)",
    (s) =>
      s.asViewer.mutation(api.notebooks.index.update, {
        id: s.notebookId,
        chatSettings: {
          instructionMode: "custom",
          customInstructions: "x",
          responseLength: "default",
        },
      }),
  ],
  [
    "notebooks.remove",
    (s) => s.asViewer.mutation(api.notebooks.index.remove, { id: s.notebookId }),
  ],
  [
    "public.setPublic",
    (s) =>
      s.asViewer.mutation(api.notebooks.public.setPublic, {
        notebookId: s.notebookId,
        isPublic: false,
      }),
  ],
  [
    "sharing.createShareLink",
    (s) =>
      s.asViewer.mutation(api.notebooks.sharing.createShareLink, {
        notebookId: s.notebookId,
        kind: "collaborate",
      }),
  ],
  [
    "sharing.revokeShareLink",
    (s) =>
      s.asViewer.mutation(api.notebooks.sharing.revokeShareLink, { shareLinkId: s.shareLinkId }),
  ],

  // Sources
  [
    "documents.upload",
    (s) =>
      s.asViewer.mutation(api.documents.index.upload, {
        notebookId: s.notebookId,
        type: "text",
        source: "hello",
        fileName: "Mine",
      }),
  ],
  [
    "documents.bulkUpload",
    (s) =>
      s.asViewer.mutation(api.documents.bulkUpload.bulkUpload, {
        notebookId: s.notebookId,
        papers: [],
      }),
  ],
  [
    "documents.addExternalSources",
    (s) =>
      s.asViewer.mutation(api.documents.index.addExternalSources, {
        notebookId: s.notebookId,
        sources: [{ title: "T", url: "https://example.org", sourceType: "web" }],
      }),
  ],
  [
    "documents.update",
    (s) => s.asViewer.mutation(api.documents.index.update, { id: s.documentId, title: "Mine" }),
  ],
  [
    "documents.remove",
    (s) => s.asViewer.mutation(api.documents.index.remove, { id: s.documentId }),
  ],
  [
    "documents.removeMany",
    (s) => s.asViewer.mutation(api.documents.index.removeMany, { ids: [s.documentId] }),
  ],
  [
    "paperFullText.findFullText",
    (s) =>
      s.asViewer.mutation(api.documents.paperFullText.findFullText, { documentId: s.documentId }),
  ],
  [
    "paperFullText.attachPdf",
    (s) =>
      s.asViewer.mutation(api.documents.paperFullText.attachPdf, {
        documentId: s.documentId,
        storageId: s.uploadId,
      }),
    { ok: false, reason: "You can't edit this notebook." },
  ],
  [
    "refreshRemote.refreshNotebookRemoteSources",
    (s) =>
      s.asViewer.action(api.documents.refreshRemote.refreshNotebookRemoteSources, {
        notebookId: s.notebookId,
      }),
  ],
  [
    "refreshRemote.refreshRemoteSource",
    (s) =>
      s.asViewer.action(api.documents.refreshRemote.refreshRemoteSource, {
        documentId: s.documentId,
      }),
  ],
  [
    "googleDrive.ingestFromGoogleDrive",
    (s) =>
      s.asViewer.action(api.googleDrive.ingestFromGoogleDrive, {
        notebookId: s.notebookId,
        fileId: "f",
        fileName: "f.pdf",
        mimeType: "application/pdf",
        accessToken: "not-a-token",
      }),
  ],

  // The owner's chat thread
  [
    "chat.remove",
    (s) => s.asViewer.mutation(api.chat.index.remove, { conversationId: s.conversationId }),
  ],
  [
    "messages.renameConversation",
    (s) =>
      s.asViewer.mutation(api.chat.messages.renameConversation, {
        conversationId: s.conversationId,
        title: "Mine",
      }),
  ],
  [
    "messages.clearHistory",
    (s) =>
      s.asViewer.mutation(api.chat.messages.clearHistory, {
        notebookId: s.notebookId,
        conversationId: s.conversationId,
      }),
    { message: "Conversation not found" },
  ],
  [
    "messages.deleteMessagesFrom",
    (s) => s.asViewer.mutation(api.chat.messages.deleteMessagesFrom, { messageId: s.messageId }),
  ],
  [
    "messages.setMessageFeedback",
    (s) =>
      s.asViewer.mutation(api.chat.messages.setMessageFeedback, {
        messageId: s.messageId,
        feedback: "up",
      }),
  ],
  [
    "messages.sendMessageOptimistic (owner's thread)",
    (s) =>
      s.asViewer.mutation(api.chat.messages.sendMessageOptimistic, {
        notebookId: s.notebookId,
        conversationId: s.conversationId,
        message: "hi",
      }),
  ],

  // Notes
  [
    "userNotes.create",
    (s) =>
      s.asViewer.mutation(api.notes.userNotes.create, { notebookId: s.notebookId, title: "Mine" }),
  ],
  [
    "userNotes.update",
    (s) => s.asViewer.mutation(api.notes.userNotes.update, { id: s.noteId, title: "Mine" }),
  ],
  ["userNotes.remove", (s) => s.asViewer.mutation(api.notes.userNotes.remove, { id: s.noteId })],
  [
    "userNotes.saveChat",
    (s) =>
      s.asViewer.action(api.notes.userNotes.saveChat, {
        notebookId: s.notebookId,
        messages: [],
        messageCount: 0,
      }),
  ],

  // Deep research and literature review
  [
    "research.startDeepResearch",
    (s) =>
      s.asViewer.mutation(api.research.index.startDeepResearch, {
        notebookId: s.notebookId,
        query: "q",
      }),
  ],
  [
    "research.approveResearchPlan",
    (s) => s.asViewer.mutation(api.research.index.approveResearchPlan, { planId: s.planId }),
  ],
  [
    "research.rejectResearchPlan",
    (s) => s.asViewer.mutation(api.research.index.rejectResearchPlan, { planId: s.planId }),
  ],
  [
    "research.retryDeepResearch",
    (s) => s.asViewer.mutation(api.research.index.retryDeepResearch, { planId: s.planId }),
  ],
  [
    "literature.startLiteratureReview",
    (s) =>
      s.asViewer.mutation(api.studio.literature_tables.index.startLiteratureReview, {
        notebookId: s.notebookId,
        query: "q",
      }),
  ],
  [
    "literature.confirmLiteratureReviewColumns",
    (s) =>
      s.asViewer.mutation(api.studio.literature_tables.index.confirmLiteratureReviewColumns, {
        sessionId: s.sessionId,
        confirmedColumns: [],
      }),
  ],
  [
    "literature.retryLiteratureReview",
    (s) =>
      s.asViewer.mutation(api.studio.literature_tables.index.retryLiteratureReview, {
        sessionId: s.sessionId,
      }),
  ],
  [
    "literature.saveLiteratureReportAsStudioReport",
    (s) =>
      s.asViewer.mutation(api.studio.literature_tables.index.saveLiteratureReportAsStudioReport, {
        reportId: s.literatureReportId,
      }),
  ],
  [
    "literature.saveLiteratureTableAsStudioSpreadsheet",
    (s) =>
      s.asViewer.mutation(
        api.studio.literature_tables.index.saveLiteratureTableAsStudioSpreadsheet,
        {
          tableId: s.literatureTableId,
          title: "Mine",
          columns: [],
          papers: [],
        }
      ),
  ],

  // Studio generation
  ...(
    [
      ["scheduleReport", api.studio.scheduling.reports.scheduleReport],
      ["scheduleFlashcards", api.studio.scheduling.flashcards.scheduleFlashcards],
      ["scheduleQuiz", api.studio.scheduling.quizzes.scheduleQuiz],
      ["scheduleSpreadsheet", api.studio.scheduling.spreadsheets.scheduleSpreadsheet],
      ["scheduleWrittenQuestions", api.studio.scheduling.writtenQuestions.scheduleWrittenQuestions],
    ] as const
  ).map(
    ([name, fn]): Case => [
      `scheduling.${name}`,
      (s) => s.asViewer.action(fn, { notebookId: s.notebookId, documentIds: [s.documentId] }),
    ]
  ),
  [
    "mindmaps.generateMindMap",
    (s) =>
      s.asViewer.mutation(api.studio.mindmaps.index.generateMindMap, {
        notebookId: s.notebookId,
        documentIds: [s.documentId],
      }),
  ],
  [
    "audio.generateAudioOverview",
    (s) =>
      s.asViewer.mutation(api.studio.audio.index.generateAudioOverview, {
        notebookId: s.notebookId,
        documentIds: [s.documentId],
      }),
  ],
  [
    "infographic.generateInfographic",
    (s) =>
      s.asViewer.mutation(api.studio.infographic.index.generateInfographic, {
        notebookId: s.notebookId,
        documentIds: [s.documentId],
      }),
  ],

  // Studio create
  [
    "reports.create",
    (s) =>
      s.asViewer.mutation(api.studio.reports.index.create, {
        notebookId: s.notebookId,
        title: "x",
      }),
  ],
  [
    "flashcards.create",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.create, {
        notebookId: s.notebookId,
        title: "x",
      }),
  ],
  [
    "quizzes.create",
    (s) =>
      s.asViewer.mutation(api.studio.quizzes.index.create, {
        notebookId: s.notebookId,
        title: "x",
      }),
  ],
  [
    "mindmaps.create",
    (s) =>
      s.asViewer.mutation(api.studio.mindmaps.index.create, {
        notebookId: s.notebookId,
        title: "x",
      }),
  ],
  [
    "audio.create",
    (s) =>
      s.asViewer.mutation(api.studio.audio.index.create, { notebookId: s.notebookId, title: "x" }),
  ],
  [
    "infographic.create",
    (s) =>
      s.asViewer.mutation(api.studio.infographic.index.create, {
        notebookId: s.notebookId,
        title: "x",
      }),
  ],
  [
    "spreadsheets.create",
    (s) =>
      s.asViewer.mutation(api.studio.spreadsheets.index.create, {
        notebookId: s.notebookId,
        title: "x",
      }),
  ],
  [
    "writtenQuestions.create",
    (s) =>
      s.asViewer.mutation(api.studio.writtenQuestions.index.create, {
        notebookId: s.notebookId,
        title: "x",
        questionType: "short",
      }),
  ],

  // Studio update
  [
    "reports.update",
    (s) => s.asViewer.mutation(api.studio.reports.index.update, { id: s.reportId, title: "x" }),
  ],
  [
    "flashcards.update",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.update, { id: s.flashcardId, title: "x" }),
  ],
  [
    "quizzes.update",
    (s) => s.asViewer.mutation(api.studio.quizzes.index.update, { id: s.quizId, title: "x" }),
  ],
  [
    "mindmaps.update",
    (s) => s.asViewer.mutation(api.studio.mindmaps.index.update, { id: s.mindmapId, title: "x" }),
  ],
  [
    "audio.update",
    (s) => s.asViewer.mutation(api.studio.audio.index.update, { id: s.audioId, title: "x" }),
  ],
  [
    "audio.updateAudioOverview",
    (s) =>
      s.asViewer.mutation(api.studio.audio.index.updateAudioOverview, {
        audioOverviewId: s.audioId,
        title: "x",
      }),
  ],
  [
    "infographic.update",
    (s) =>
      s.asViewer.mutation(api.studio.infographic.index.update, { id: s.infographicId, title: "x" }),
  ],
  [
    "spreadsheets.update",
    (s) =>
      s.asViewer.mutation(api.studio.spreadsheets.index.update, {
        id: s.spreadsheetId,
        title: "x",
      }),
  ],
  [
    "writtenQuestions.update",
    (s) =>
      s.asViewer.mutation(api.studio.writtenQuestions.index.update, {
        id: s.writtenId,
        title: "x",
      }),
  ],

  // Practice on the owner's rows
  [
    "flashcards.submitCardReview",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.submitCardReview, {
        id: s.flashcardId,
        cardIndex: 0,
        rating: "good",
      }),
  ],
  [
    "flashcards.updateCard",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.updateCard, {
        id: s.flashcardId,
        cardIndex: 0,
        front: "x",
      }),
  ],
  [
    "flashcards.addCard",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.addCard, {
        id: s.flashcardId,
        front: "x",
        back: "y",
      }),
  ],
  [
    "flashcards.deleteCard",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.deleteCard, {
        id: s.flashcardId,
        cardIndex: 0,
      }),
  ],
  [
    "flashcards.updatePreferences",
    (s) =>
      s.asViewer.mutation(api.studio.flashcards.index.updatePreferences, {
        id: s.flashcardId,
        showMastered: true,
      }),
  ],
  [
    "quizzes.submitAnswer",
    (s) =>
      s.asViewer.mutation(api.studio.quizzes.index.submitAnswer, {
        id: s.quizId,
        questionIndex: 0,
        selectedOption: 1,
      }),
  ],
  [
    "writtenQuestions.saveUserAnswerDraft",
    (s) =>
      s.asViewer.mutation(api.studio.writtenQuestions.index.saveUserAnswerDraft, {
        id: s.writtenId,
        questionId: "q1",
        answer: "x",
      }),
  ],
  [
    "writtenQuestions.submitAndGrade",
    (s) =>
      s.asViewer.action(api.studio.writtenQuestions.grading.submitAndGrade, {
        writtenQuestionsId: s.writtenId,
        questionId: "q1",
        answer: "x",
      }),
  ],

  // Studio remove
  [
    "reports.remove",
    (s) => s.asViewer.mutation(api.studio.reports.index.remove, { id: s.reportId }),
  ],
  [
    "flashcards.remove",
    (s) => s.asViewer.mutation(api.studio.flashcards.index.remove, { id: s.flashcardId }),
  ],
  ["quizzes.remove", (s) => s.asViewer.mutation(api.studio.quizzes.index.remove, { id: s.quizId })],
  [
    "mindmaps.remove",
    (s) => s.asViewer.mutation(api.studio.mindmaps.index.remove, { id: s.mindmapId }),
  ],
  [
    "mindmaps.deleteMindMap",
    (s) => s.asViewer.mutation(api.studio.mindmaps.index.deleteMindMap, { mindmapId: s.mindmapId }),
  ],
  ["audio.remove", (s) => s.asViewer.mutation(api.studio.audio.index.remove, { id: s.audioId })],
  [
    "audio.deleteAudioOverview",
    (s) =>
      s.asViewer.mutation(api.studio.audio.index.deleteAudioOverview, {
        audioOverviewId: s.audioId,
      }),
  ],
  [
    "infographic.remove",
    (s) => s.asViewer.mutation(api.studio.infographic.index.remove, { id: s.infographicId }),
  ],
  [
    "spreadsheets.remove",
    (s) => s.asViewer.mutation(api.studio.spreadsheets.index.remove, { id: s.spreadsheetId }),
  ],
  [
    "spreadsheets.deleteSpreadsheet",
    (s) =>
      s.asViewer.mutation(api.studio.spreadsheets.index.deleteSpreadsheet, {
        spreadsheetId: s.spreadsheetId,
      }),
  ],
  [
    "writtenQuestions.remove",
    (s) =>
      s.asViewer.mutation(api.studio.writtenQuestions.index.remove, {
        writtenQuestionId: s.writtenId,
      }),
  ],
];

describe("a public notebook's viewer can't write to it", () => {
  test.each(cases)("%s is refused", async (_name, call, refusal) => {
    const seeded = await seed();
    if (refusal === undefined) {
      await expect(call(seeded)).rejects.toThrow(ACCESS_REFUSED);
    } else {
      await expect(call(seeded)).resolves.toEqual(refusal);
    }
  });

  test("the notebook and its rows are untouched after every refused call", async () => {
    const seeded = await seed();
    for (const [, call] of cases) {
      await call(seeded).catch(() => undefined);
    }
    const after = await seeded.t.run(async (ctx) => ({
      notebook: await ctx.db.get(seeded.notebookId),
      document: await ctx.db.get(seeded.documentId),
      note: await ctx.db.get(seeded.noteId),
      flashcard: await ctx.db.get(seeded.flashcardId),
      messages: await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", seeded.conversationId))
        .collect(),
      notebookDocuments: await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", seeded.notebookId))
        .collect(),
    }));
    expect(after.notebook).toMatchObject({ title: "Public", isPublic: true });
    expect(after.document?.fileName).toBe("paper.pdf");
    expect(after.note?.content).toBe("Private thoughts");
    expect(after.flashcard?.cardsData).toEqual([{ front: "Q", back: "A" }]);
    expect(after.flashcard?.metadata).toBeUndefined();
    expect(after.messages.map((m) => m.content)).toEqual(["Owner's question"]);
    expect(after.notebookDocuments).toHaveLength(1);
  });
});
