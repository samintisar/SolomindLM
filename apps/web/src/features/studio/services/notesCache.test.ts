import { api } from "@convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteUserNote, useUpdateUserNote } from "@/features/chat/services/userNotesApi";
import { useDeleteAudioOverview, useUpdateAudioOverview } from "./audioApi";
import { useDeleteFlashcard, useRenameFlashcard } from "./flashcardsApi";
import { useDeleteInfographic, useRenameInfographic } from "./infographicApi";
import { useDeleteMindMap, useRenameMindMap } from "./mindMapApi";
import { patchNoteInNotesCache, removeNoteFromNotesCache } from "./notesCache";
import { useDeleteQuiz, useRenameQuiz } from "./quizzesApi";
import { useDeleteReport, useUpdateReport } from "./reportsApi";
import { useDeleteSpreadsheet, useRenameSpreadsheet } from "./spreadsheetsApi";
import { useDeleteWrittenQuestions, useRenameWrittenQuestions } from "./writtenQuestionsApi";

type OptimisticUpdate = (localStore: OptimisticLocalStore, args: Record<string, unknown>) => void;

/** The optimistic update the last `useMutation(...).withOptimisticUpdate(...)` call registered. */
const registered = vi.hoisted(() => ({ update: null as OptimisticUpdate | null }));

vi.mock("convex/react", () => ({
  useMutation: () => ({
    withOptimisticUpdate: (update: OptimisticUpdate) => {
      registered.update = update;
      return vi.fn();
    },
  }),
  useAction: () => vi.fn(),
  useQuery: () => undefined,
}));

type Entry = { name: string; args: Record<string, unknown>; value: unknown };

/**
 * Names a query reference. Vitest's `api` mock (src/test/mocks/convexGeneratedApi.ts)
 * hands out a fresh proxy per access, tagged with its path via `Symbol.toStringTag`.
 */
function queryName(query: FunctionReference<"query">): string {
  return Object.prototype.toString.call(query);
}

function sameArgs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A localStore holding a fixed set of cached query results. */
function fakeLocalStore(entries: Entry[]) {
  const store = {
    getQuery(query: FunctionReference<"query">, args: Record<string, unknown>) {
      const name = queryName(query);
      return entries.find((e) => e.name === name && sameArgs(e.args, args))?.value;
    },
    getAllQueries(query: FunctionReference<"query">) {
      const name = queryName(query);
      return entries.filter((e) => e.name === name).map(({ args, value }) => ({ args, value }));
    },
    setQuery(query: FunctionReference<"query">, args: Record<string, unknown>, value: unknown) {
      const name = queryName(query);
      const entry = entries.find((e) => e.name === name && sameArgs(e.args, args));
      if (entry) entry.value = value;
      else entries.push({ name, args, value });
    },
  };
  return store as unknown as OptimisticLocalStore;
}

const GET = queryName(api.notes.index.get);
const LIST = queryName(api.notes.index.list);

/** Cached notes queries: `x1` is open and listed (unfiltered and type-filtered); `x2` is not. */
function cache(type: string): Entry[] {
  return [
    {
      name: GET,
      args: { type, id: "x1" },
      value: { _id: "x1", _type: type, title: "Old", content: "body", notebookId: "n1" },
    },
    {
      name: GET,
      args: { type: "report", id: "x2" },
      value: { _id: "x2", _type: "report", title: "Other", notebookId: "n1" },
    },
    {
      name: LIST,
      args: { notebookId: "n1" },
      value: [
        { _id: "x1", _type: type, title: "Old" },
        { _id: "x2", _type: "report", title: "Other" },
      ],
    },
    {
      name: LIST,
      args: { notebookId: "n1", types: [type] },
      value: [{ _id: "x1", _type: type, title: "Old" }],
    },
    {
      name: LIST,
      args: { notebookId: "n2" },
      value: [{ _id: "x9", _type: "report", title: "Elsewhere" }],
    },
  ];
}

function cachedValue(entries: Entry[], name: string, args: Record<string, unknown>) {
  return entries.find((e) => e.name === name && sameArgs(e.args, args))?.value;
}

describe("patchNoteInNotesCache", () => {
  it("patches the title into notes.get and every cached notes.list row with that id", () => {
    const entries = cache("mindmap");
    patchNoteInNotesCache(fakeLocalStore(entries), "x1", { title: "New" });

    expect(cachedValue(entries, GET, { type: "mindmap", id: "x1" })).toMatchObject({
      title: "New",
      content: "body",
    });
    expect(cachedValue(entries, GET, { type: "report", id: "x2" })).toMatchObject({
      title: "Other",
    });
    expect(cachedValue(entries, LIST, { notebookId: "n1" })).toEqual([
      { _id: "x1", _type: "mindmap", title: "New" },
      { _id: "x2", _type: "report", title: "Other" },
    ]);
    expect(cachedValue(entries, LIST, { notebookId: "n1", types: ["mindmap"] })).toEqual([
      { _id: "x1", _type: "mindmap", title: "New" },
    ]);
    expect(cachedValue(entries, LIST, { notebookId: "n2" })).toEqual([
      { _id: "x9", _type: "report", title: "Elsewhere" },
    ]);
  });

  it("patches heavy fields into notes.get only, since list rows strip them", () => {
    const entries = cache("report");
    const listsBefore = JSON.stringify(entries.filter((e) => e.name === LIST));
    patchNoteInNotesCache(fakeLocalStore(entries), "x1", { content: "edited" });

    expect(cachedValue(entries, GET, { type: "report", id: "x1" })).toMatchObject({
      title: "Old",
      content: "edited",
    });
    expect(JSON.stringify(entries.filter((e) => e.name === LIST))).toBe(listsBefore);
  });

  it("ignores undefined fields instead of blanking them", () => {
    const entries = cache("report");
    patchNoteInNotesCache(fakeLocalStore(entries), "x1", { title: undefined, content: "edited" });

    expect(cachedValue(entries, GET, { type: "report", id: "x1" })).toMatchObject({
      title: "Old",
      content: "edited",
    });
    expect(cachedValue(entries, LIST, { notebookId: "n1" })).toEqual([
      { _id: "x1", _type: "report", title: "Old" },
      { _id: "x2", _type: "report", title: "Other" },
    ]);
  });

  it("skips queries that are still loading or returned null", () => {
    const entries: Entry[] = [
      { name: GET, args: { type: "quiz", id: "x1" }, value: null },
      { name: LIST, args: { notebookId: "n1" }, value: undefined },
    ];
    patchNoteInNotesCache(fakeLocalStore(entries), "x1", { title: "New" });

    expect(entries[0].value).toBeNull();
    expect(entries[1].value).toBeUndefined();
  });
});

describe("removeNoteFromNotesCache", () => {
  it("nulls notes.get for that id and drops its row from every cached notes.list", () => {
    const entries = cache("quiz");
    removeNoteFromNotesCache(fakeLocalStore(entries), "x1");

    expect(cachedValue(entries, GET, { type: "quiz", id: "x1" })).toBeNull();
    expect(cachedValue(entries, GET, { type: "report", id: "x2" })).toMatchObject({ _id: "x2" });
    expect(cachedValue(entries, LIST, { notebookId: "n1" })).toEqual([
      { _id: "x2", _type: "report", title: "Other" },
    ]);
    expect(cachedValue(entries, LIST, { notebookId: "n1", types: ["quiz"] })).toEqual([]);
    expect(cachedValue(entries, LIST, { notebookId: "n2" })).toEqual([
      { _id: "x9", _type: "report", title: "Elsewhere" },
    ]);
  });

  it("leaves queries that are still loading alone", () => {
    const entries: Entry[] = [
      { name: GET, args: { type: "quiz", id: "x1" }, value: undefined },
      { name: LIST, args: { notebookId: "n1" }, value: undefined },
    ];
    removeNoteFromNotesCache(fakeLocalStore(entries), "x1");

    expect(entries[0].value).toBeUndefined();
    expect(entries[1].value).toBeUndefined();
  });
});

/**
 * Run the optimistic update a mutation hook registers, against a fake localStore.
 * `convex/react` is mocked, so the hook calls no real React hooks and runs outside a component.
 */
function runOptimisticUpdate(
  mutationHook: () => unknown,
  entries: Entry[],
  args: Record<string, unknown>
) {
  registered.update = null;
  mutationHook();
  const update = registered.update as OptimisticUpdate | null;
  if (!update) throw new Error("hook registered no optimistic update");
  update(fakeLocalStore(entries), args);
}

// Each Studio type the panel lists: its notes `_type`, rename hook and the mutation args
// it sends, delete hook and its args. Literature tables/reports are not listed by
// `notes.index` (they save into reports/spreadsheets), so they have no entry here.
const STUDIO_TYPES = [
  { type: "report", rename: useUpdateReport, del: useDeleteReport },
  { type: "flashcard", rename: useRenameFlashcard, del: useDeleteFlashcard },
  { type: "quiz", rename: useRenameQuiz, del: useDeleteQuiz },
  { type: "mindmap", rename: useRenameMindMap, del: useDeleteMindMap },
  { type: "infographic", rename: useRenameInfographic, del: useDeleteInfographic },
  { type: "spreadsheet", rename: useRenameSpreadsheet, del: useDeleteSpreadsheet },
  {
    type: "writtenQuestions",
    rename: useRenameWrittenQuestions,
    del: useDeleteWrittenQuestions,
    deleteArgs: { writtenQuestionId: "x1" },
  },
  { type: "audioOverview", rename: useUpdateAudioOverview, del: useDeleteAudioOverview },
  { type: "note", rename: useUpdateUserNote, del: useDeleteUserNote },
];

describe.each(STUDIO_TYPES)("$type hooks", ({ type, rename, del, deleteArgs }) => {
  beforeEach(() => {
    registered.update = null;
  });

  it("rename shows the new title in the open item and the list right away", () => {
    const entries = cache(type);
    runOptimisticUpdate(rename, entries, { id: "x1", title: "New" });

    expect(cachedValue(entries, GET, { type, id: "x1" })).toMatchObject({ title: "New" });
    expect(cachedValue(entries, LIST, { notebookId: "n1" })).toEqual([
      { _id: "x1", _type: type, title: "New" },
      { _id: "x2", _type: "report", title: "Other" },
    ]);
  });

  it("delete closes the open item and drops it from the list right away", () => {
    const entries = cache(type);
    runOptimisticUpdate(del, entries, deleteArgs ?? { id: "x1" });

    expect(cachedValue(entries, GET, { type, id: "x1" })).toBeNull();
    expect(cachedValue(entries, LIST, { notebookId: "n1" })).toEqual([
      { _id: "x2", _type: "report", title: "Other" },
    ]);
  });
});
