import { describe, expect, it } from "vitest";
import {
  composerPrefsStorageKey,
  defaultComposerPrefsForMode,
  parseStoredComposerPrefs,
} from "./composerPrefsStorage";

describe("composerPrefsStorage", () => {
  it("builds a stable storage key per notebook", () => {
    expect(composerPrefsStorageKey("nb_123")).toBe("solomind:chat-composer:v1:nb_123");
  });

  it("parses valid persisted prefs", () => {
    const raw = JSON.stringify({
      mode: "deepResearch",
      sourceFilters: ["notebook", "web", "academic"],
      researchDatabase: "pubmed",
    });
    expect(parseStoredComposerPrefs(raw)).toEqual({
      mode: "deepResearch",
      sourceFilters: ["notebook", "web", "academic"],
      researchDatabase: "pubmed",
    });
  });

  it("deduplicates source filters while preserving order", () => {
    const raw = JSON.stringify({
      mode: "chat",
      sourceFilters: ["web", "notebook", "web", "academic"],
      researchDatabase: "all",
    });
    expect(parseStoredComposerPrefs(raw)?.sourceFilters).toEqual(["web", "notebook", "academic"]);
  });

  it("rejects invalid mode, database, or filters", () => {
    expect(
      parseStoredComposerPrefs(
        JSON.stringify({
          mode: "invalid",
          sourceFilters: ["notebook"],
          researchDatabase: "all",
        })
      )
    ).toBeNull();

    expect(
      parseStoredComposerPrefs(
        JSON.stringify({
          mode: "chat",
          sourceFilters: ["notebook"],
          researchDatabase: "scholar",
        })
      )
    ).toBeNull();

    expect(
      parseStoredComposerPrefs(
        JSON.stringify({
          mode: "chat",
          sourceFilters: ["notebook", "social"],
          researchDatabase: "all",
        })
      )
    ).toBeNull();

    expect(parseStoredComposerPrefs(JSON.stringify({ mode: "chat" }))).toBeNull();
    expect(parseStoredComposerPrefs("not-json")).toBeNull();
    expect(parseStoredComposerPrefs(null)).toBeNull();
  });

  it("returns mode-specific defaults", () => {
    expect(defaultComposerPrefsForMode("chat")).toEqual({
      mode: "chat",
      sourceFilters: ["notebook"],
      researchDatabase: "all",
    });
    expect(defaultComposerPrefsForMode("deepResearch").sourceFilters).toEqual([
      "notebook",
      "web",
      "academic",
    ]);
  });
});
