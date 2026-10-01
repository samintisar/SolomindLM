import {
  CHAT_DEFAULT_SOURCE_FILTERS,
  type ChatComposerMode,
  DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS,
  isComposerMode,
  isResearchDatabase,
  type ResearchDatabaseOption,
} from "../components/composer/constants";

const COMPOSER_PREFS_STORAGE_KEY_PREFIX = "solomind:chat-composer:v1:";

const SOURCE_CHANNEL_IDS = ["notebook", "academic", "web", "news", "finance"] as const;

export type PersistedComposerPrefs = {
  mode: ChatComposerMode;
  sourceFilters: string[];
  researchDatabase: ResearchDatabaseOption;
};

export function composerPrefsStorageKey(notebookId: string): string {
  return `${COMPOSER_PREFS_STORAGE_KEY_PREFIX}${notebookId}`;
}

export function defaultComposerPrefsForMode(mode: ChatComposerMode): PersistedComposerPrefs {
  return {
    mode,
    sourceFilters:
      mode === "deepResearch"
        ? [...DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS]
        : [...CHAT_DEFAULT_SOURCE_FILTERS],
    researchDatabase: "all",
  };
}

export function parseStoredComposerPrefs(raw: string | null): PersistedComposerPrefs | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const mode = record.mode;
  const researchDatabase = record.researchDatabase;
  const sourceFilters = record.sourceFilters;

  if (!isComposerMode(mode) || !isResearchDatabase(researchDatabase)) {
    return null;
  }

  if (!Array.isArray(sourceFilters) || sourceFilters.length === 0) {
    return null;
  }

  const allowed = new Set<string>(SOURCE_CHANNEL_IDS);
  const filters: string[] = [];
  for (const item of sourceFilters) {
    if (typeof item !== "string" || !allowed.has(item)) {
      return null;
    }
    if (!filters.includes(item)) {
      filters.push(item);
    }
  }

  if (filters.length === 0) return null;

  return {
    mode,
    sourceFilters: filters,
    researchDatabase,
  };
}

export function readComposerPrefsFromStorage(notebookId: string): PersistedComposerPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(composerPrefsStorageKey(notebookId));
    return parseStoredComposerPrefs(raw);
  } catch {
    return null;
  }
}

export function writeComposerPrefsToStorage(
  notebookId: string,
  prefs: PersistedComposerPrefs
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(composerPrefsStorageKey(notebookId), JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.)
  }
}
