import type { ChatComposerMode, ResearchDatabaseOption } from "../components/ChatInput";
import {
  CHAT_DEFAULT_SOURCE_FILTERS,
  DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS,
} from "../components/ChatInput";

export const COMPOSER_PREFS_STORAGE_KEY_PREFIX = "solomind:chat-composer:v1:";

export const SOURCE_CHANNEL_IDS = [
  "notebook",
  "academic",
  "web",
  "news",
  "finance",
] as const;

const COMPOSER_MODES: ChatComposerMode[] = ["chat", "deepResearch", "literatureReview"];
const RESEARCH_DATABASES: ResearchDatabaseOption[] = ["all", "pubmed", "arxiv"];

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

  if (typeof mode !== "string" || !COMPOSER_MODES.includes(mode as ChatComposerMode)) {
    return null;
  }

  if (
    typeof researchDatabase !== "string" ||
    !RESEARCH_DATABASES.includes(researchDatabase as ResearchDatabaseOption)
  ) {
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
    mode: mode as ChatComposerMode,
    sourceFilters: filters,
    researchDatabase: researchDatabase as ResearchDatabaseOption,
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
