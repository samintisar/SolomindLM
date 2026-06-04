import { useEffect, useRef, useState } from "react";
import type { ChatComposerMode, ResearchDatabaseOption } from "../components/ChatInput";
import {
  defaultComposerPrefsForMode,
  type PersistedComposerPrefs,
  readComposerPrefsFromStorage,
  writeComposerPrefsToStorage,
} from "../utils/composerPrefsStorage";

function loadPrefsForNotebook(notebookKey: string | null) {
  if (!notebookKey) return defaultComposerPrefsForMode("chat");
  return readComposerPrefsFromStorage(notebookKey) ?? defaultComposerPrefsForMode("chat");
}

/**
 * Persists composer mode, source filters, and research database per notebook (localStorage).
 */
export function usePersistedComposerPrefs(notebookId: string | null | undefined) {
  const notebookKey = notebookId ? String(notebookId) : null;
  const hydratedKeyRef = useRef<string | null>(null);
  const initialPrefsRef = useRef<PersistedComposerPrefs | null>(null);

  const [composerMode, setComposerMode] = useState<ChatComposerMode>(() => {
    if (!initialPrefsRef.current) {
      initialPrefsRef.current = loadPrefsForNotebook(notebookKey);
    }
    return initialPrefsRef.current.mode;
  });
  const [sourceFilters, setSourceFilters] = useState<string[]>(() => {
    if (!initialPrefsRef.current) {
      initialPrefsRef.current = loadPrefsForNotebook(notebookKey);
    }
    return initialPrefsRef.current.sourceFilters;
  });
  const [researchDatabase, setResearchDatabase] = useState<ResearchDatabaseOption>(() => {
    if (!initialPrefsRef.current) {
      initialPrefsRef.current = loadPrefsForNotebook(notebookKey);
    }
    return initialPrefsRef.current.researchDatabase;
  });

  useEffect(() => {
    const loaded = loadPrefsForNotebook(notebookKey);
    setComposerMode(loaded.mode);
    setSourceFilters(loaded.sourceFilters);
    setResearchDatabase(loaded.researchDatabase);
    hydratedKeyRef.current = notebookKey;
  }, [notebookKey]);

  useEffect(() => {
    if (!notebookKey || hydratedKeyRef.current !== notebookKey) return;
    writeComposerPrefsToStorage(notebookKey, {
      mode: composerMode,
      sourceFilters,
      researchDatabase,
    });
  }, [notebookKey, composerMode, sourceFilters, researchDatabase]);

  return {
    composerMode,
    setComposerMode,
    sourceFilters,
    setSourceFilters,
    researchDatabase,
    setResearchDatabase,
  };
}
