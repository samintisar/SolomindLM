import { describe, expect, test } from "vitest";
import type { NotebookItem } from "@/shared/types/index";
import { isVisitedNotebookGone, notebookHeaderProps } from "./notebookHeaderProps";

const nb = (extra: Partial<NotebookItem>): NotebookItem => ({
  id: "n1",
  title: "Cell Biology",
  date: "Oct 14, 2026",
  ...extra,
});

describe("notebookHeaderProps", () => {
  test("owner can rename and share, no byline or fork", () => {
    expect(notebookHeaderProps(nb({ access: "owner" }), true)).toEqual({
      renamable: true,
      canShare: true,
      byline: undefined,
      canFork: false,
    });
  });

  test("editor (cowork link) gets a read-only title and no share", () => {
    expect(notebookHeaderProps(nb({ access: "editor", ownerName: "Ada" }), true)).toEqual({
      renamable: false,
      canShare: false,
      byline: undefined,
      canFork: false,
    });
  });

  test("viewer of a public notebook gets the byline and Fork", () => {
    expect(notebookHeaderProps(nb({ access: "viewer", ownerName: "Ada" }), true)).toEqual({
      renamable: false,
      canShare: false,
      byline: "Public · by Ada",
      canFork: true,
    });
  });

  test("viewer without an owner name falls back to a generic author", () => {
    expect(notebookHeaderProps(nb({ access: "viewer" }), true).byline).toBe(
      "Public · by SolomindLM user"
    );
  });

  test("nothing while the notebook is loading", () => {
    expect(notebookHeaderProps(undefined, true)).toEqual({
      renamable: false,
      canShare: false,
      byline: undefined,
      canFork: false,
    });
  });

  test("nothing off the notebook route", () => {
    expect(notebookHeaderProps(nb({ access: "viewer", ownerName: "Ada" }), false)).toEqual({
      renamable: false,
      canShare: false,
      byline: undefined,
      canFork: false,
    });
  });
});

describe("isVisitedNotebookGone", () => {
  const gone = {
    urlNotebookId: "n1",
    hasShareToken: false,
    listLoaded: true,
    listed: false,
    visited: null,
  };

  test("an unlisted notebook the server no longer returns is gone", () => {
    expect(isVisitedNotebookGone(gone)).toBe(true);
  });

  test("not while the visited notebook is loading", () => {
    expect(isVisitedNotebookGone({ ...gone, visited: undefined })).toBe(false);
  });

  test("not while the list is loading", () => {
    expect(isVisitedNotebookGone({ ...gone, listLoaded: false })).toBe(false);
  });

  test("not for a listed notebook", () => {
    expect(isVisitedNotebookGone({ ...gone, listed: true })).toBe(false);
  });

  test("not for the new-notebook route or no notebook", () => {
    expect(isVisitedNotebookGone({ ...gone, urlNotebookId: "new" })).toBe(false);
    expect(isVisitedNotebookGone({ ...gone, urlNotebookId: null })).toBe(false);
  });

  test("not while a cowork share link is being redeemed", () => {
    expect(isVisitedNotebookGone({ ...gone, hasShareToken: true })).toBe(false);
  });
});
