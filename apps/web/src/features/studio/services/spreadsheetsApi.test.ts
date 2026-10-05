import { api } from "@convex/_generated/api";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import {
  enqueueSpreadsheetSave,
  isSpreadsheetSaveQueued,
  patchSpreadsheetInNotesCache,
} from "./spreadsheetsApi";

type Entry = { name: string; args: Record<string, unknown>; value: unknown };

/**
 * Names a query reference. Vitest's `api` mock (src/test/mocks/convexGeneratedApi.ts)
 * hands out a fresh proxy per access, tagged with its path via `Symbol.toStringTag`.
 */
function queryName(query: FunctionReference<"query">): string {
  return Object.prototype.toString.call(query);
}

/** A localStore holding a fixed set of cached query results. */
function fakeLocalStore(entries: Entry[]) {
  const store = {
    getQuery(query: FunctionReference<"query">, args: Record<string, unknown>) {
      const name = queryName(query);
      return entries.find((e) => e.name === name && JSON.stringify(e.args) === JSON.stringify(args))
        ?.value;
    },
    getAllQueries(query: FunctionReference<"query">) {
      const name = queryName(query);
      return entries.filter((e) => e.name === name).map(({ args, value }) => ({ args, value }));
    },
    setQuery(query: FunctionReference<"query">, args: Record<string, unknown>, value: unknown) {
      const name = queryName(query);
      const entry = entries.find(
        (e) => e.name === name && JSON.stringify(e.args) === JSON.stringify(args)
      );
      if (entry) entry.value = value;
      else entries.push({ name, args, value });
    },
  };
  return store as unknown as OptimisticLocalStore;
}

const GET = queryName(api.notes.index.get);
const LIST = queryName(api.notes.index.list);

function cache() {
  return [
    {
      name: GET,
      args: { type: "spreadsheet", id: "s1" },
      value: { _id: "s1", _type: "spreadsheet", title: "Old", data: "a,b", notebookId: "n1" },
    },
    {
      name: GET,
      args: { type: "spreadsheet", id: "s2" },
      value: { _id: "s2", _type: "spreadsheet", title: "Other", data: "x", notebookId: "n1" },
    },
    {
      name: LIST,
      args: { notebookId: "n1" },
      value: [
        { _id: "s1", _type: "spreadsheet", title: "Old" },
        { _id: "r1", _type: "report", title: "Report" },
      ],
    },
    {
      name: LIST,
      args: { notebookId: "n2" },
      value: [{ _id: "r9", _type: "report", title: "Elsewhere" }],
    },
  ] satisfies Entry[];
}

describe("patchSpreadsheetInNotesCache", () => {
  it("patches data into the cached notes.get for that spreadsheet only, never into the list", () => {
    const entries: Entry[] = cache();
    const before = JSON.stringify(entries.filter((e) => e.name === LIST));
    patchSpreadsheetInNotesCache(fakeLocalStore(entries), "s1", { data: "a,b\n1,2" });
    expect(entries[0].value).toMatchObject({ _id: "s1", data: "a,b\n1,2", title: "Old" });
    expect(entries[1].value).toMatchObject({ _id: "s2", data: "x" });
    expect(JSON.stringify(entries.filter((e) => e.name === LIST))).toBe(before);
  });

  it("patches the title into notes.get and every cached notes.list row with that id", () => {
    const entries: Entry[] = cache();
    patchSpreadsheetInNotesCache(fakeLocalStore(entries), "s1", { title: "New" });
    expect(entries[0].value).toMatchObject({ title: "New", data: "a,b" });
    expect(entries[2].value).toEqual([
      { _id: "s1", _type: "spreadsheet", title: "New" },
      { _id: "r1", _type: "report", title: "Report" },
    ]);
    expect(entries[3].value).toEqual([{ _id: "r9", _type: "report", title: "Elsewhere" }]);
  });

  it("skips queries that are still loading or returned null", () => {
    const entries: Entry[] = [
      { name: GET, args: { type: "spreadsheet", id: "s1" }, value: null },
      { name: LIST, args: { notebookId: "n1" }, value: undefined },
    ];
    patchSpreadsheetInNotesCache(fakeLocalStore(entries), "s1", { title: "New" });
    expect(entries[0].value).toBeNull();
    expect(entries[1].value).toBeUndefined();
  });
});

describe("enqueueSpreadsheetSave", () => {
  it("runs saves for one spreadsheet one at a time in call order, even after a failure", async () => {
    const log: string[] = [];
    let release!: () => void;
    const first = enqueueSpreadsheetSave("q1", async () => {
      log.push("start 1");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      log.push("end 1");
      throw new Error("network");
    });
    const second = enqueueSpreadsheetSave("q1", async () => {
      log.push("start 2");
      return "two";
    });
    const other = enqueueSpreadsheetSave("q2", async () => {
      log.push("other");
    });
    await other;
    expect(log).toEqual(["start 1", "other"]);
    expect(isSpreadsheetSaveQueued("q1")).toBe(true);
    release();
    await expect(first).rejects.toThrow("network");
    await expect(second).resolves.toBe("two");
    expect(log).toEqual(["start 1", "other", "end 1", "start 2"]);
  });

  it("forgets a spreadsheet once its chain drains", async () => {
    await enqueueSpreadsheetSave("q3", async () => undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(isSpreadsheetSaveQueued("q3")).toBe(false);
  });
});
