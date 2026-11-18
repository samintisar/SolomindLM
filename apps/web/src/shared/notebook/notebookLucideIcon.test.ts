import { Book, Brain, Folder } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTEBOOK_ICON,
  getNotebookLucideIcon,
  NOTEBOOK_ICON_OPTIONS,
  normalizeNotebookIcon,
} from "./notebookLucideIcon";

describe("normalizeNotebookIcon", () => {
  it("defaults to the book icon, not the folder icon", () => {
    expect(DEFAULT_NOTEBOOK_ICON).toBe("Book");
  });

  it("keeps a known notebook icon", () => {
    expect(normalizeNotebookIcon("Brain")).toBe("Brain");
  });

  it("maps a missing icon to the notebook default", () => {
    expect(normalizeNotebookIcon(undefined)).toBe(DEFAULT_NOTEBOOK_ICON);
    expect(normalizeNotebookIcon(null)).toBe(DEFAULT_NOTEBOOK_ICON);
    expect(normalizeNotebookIcon("")).toBe(DEFAULT_NOTEBOOK_ICON);
  });

  it("maps the legacy stored Folder icon to the notebook default", () => {
    expect(normalizeNotebookIcon("Folder")).toBe(DEFAULT_NOTEBOOK_ICON);
  });

  it("maps an unknown icon to the notebook default", () => {
    expect(normalizeNotebookIcon("NotAnIcon")).toBe(DEFAULT_NOTEBOOK_ICON);
  });
});

describe("NOTEBOOK_ICON_OPTIONS", () => {
  it("does not offer the folder icon", () => {
    expect(NOTEBOOK_ICON_OPTIONS).not.toContain("Folder");
  });

  it("includes the default", () => {
    expect(NOTEBOOK_ICON_OPTIONS).toContain(DEFAULT_NOTEBOOK_ICON);
  });
});

describe("getNotebookLucideIcon", () => {
  it("returns the matching glyph", () => {
    expect(getNotebookLucideIcon("Brain")).toBe(Brain);
  });

  it("never returns the folder glyph", () => {
    expect(getNotebookLucideIcon("Folder")).toBe(Book);
    expect(getNotebookLucideIcon(undefined)).toBe(Book);
    expect(getNotebookLucideIcon("Folder")).not.toBe(Folder);
  });
});
