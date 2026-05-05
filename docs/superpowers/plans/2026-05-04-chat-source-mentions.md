# Chat Source Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@source` autocomplete mentions to the chat input, allowing users to attach specific notebook sources to chat messages.

**Architecture:** Plain-text mentions with tracked IDs (Approach A). The textarea remains a native `<textarea>`. When `@` is typed, a dropdown filters notebook sources. On selection, `@Source Title` is inserted as plain text. A parallel `MentionedSource[]` state tracks document IDs. On send, mentioned IDs are combined with sidebar-selected IDs and passed to the backend.

**Tech Stack:** React 19.2, TypeScript, Tailwind CSS v4, Lucide React icons

---

## File Structure

| File                                                  | Responsibility                                         |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/shared/types/index.ts`                  | Add `MentionedSource` interface                        |
| `apps/web/src/features/chat/utils/mentions.ts`        | NEW: Mention utility functions (filter, sync, combine) |
| `apps/web/src/features/chat/utils/mentions.test.ts`   | NEW: Unit tests for mention utilities                  |
| `apps/web/src/features/chat/components/ChatInput.tsx` | ADD: Mention detection, dropdown UI, keyboard nav      |
| `apps/web/src/features/chat/components/ChatPanel.tsx` | ADD: Mention state management, combine IDs on send     |
| `apps/web/src/features/chat/hooks/useChatStream.ts`   | MODIFY: Accept `documentIds` param override            |

---

## Task 1: Add MentionedSource Type

**Files:**

- Modify: `apps/web/src/shared/types/index.ts`

- [ ] **Step 1: Add MentionedSource interface after Source interface**

```typescript
export interface MentionedSource {
  documentId: string;
  title: string;
  startIndex: number;
  endIndex: number;
}
```

Insert after the `Source` interface (around line 36), before `ReferenceChunk`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/shared/types/index.ts
git commit -m "feat(chat): add MentionedSource interface"
```

---

## Task 2: Create Mention Utilities

**Files:**

- Create: `apps/web/src/features/chat/utils/mentions.ts`
- Create: `apps/web/src/features/chat/utils/mentions.test.ts`

- [ ] **Step 1: Write mention utility functions**

Create `apps/web/src/features/chat/utils/mentions.ts`:

```typescript
import { Source, MentionedSource } from "@/shared/types/index";

/**
 * Filter sources by query (case-insensitive substring match)
 */
export function filterSourcesByQuery(sources: Source[], query: string): Source[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return sources;
  return sources.filter((s) => s.title.toLowerCase().includes(normalizedQuery));
}

/**
 * Sync mentioned sources with current text.
 * Removes mentions whose text no longer matches, updates indices for valid ones.
 */
export function syncMentions(text: string, mentions: MentionedSource[]): MentionedSource[] {
  return mentions
    .map((mention) => {
      const expectedText = `@${mention.title}`;
      // Check if mention still exists at recorded position
      if (text.slice(mention.startIndex, mention.endIndex) === expectedText) {
        return mention;
      }
      // Try to find it elsewhere in the text
      const newIndex = text.indexOf(expectedText);
      if (newIndex !== -1) {
        return {
          ...mention,
          startIndex: newIndex,
          endIndex: newIndex + expectedText.length,
        };
      }
      // Mention no longer exists in text
      return null;
    })
    .filter((m): m is MentionedSource => m !== null);
}

/**
 * Combine mentioned document IDs with sidebar-selected IDs, deduplicated
 */
export function combineDocumentIds(mentionedIds: string[], selectedIds: string[]): string[] {
  return [...new Set([...mentionedIds, ...selectedIds])];
}

/**
 * Extract document IDs from mentions
 */
export function getDocumentIdsFromMentions(mentions: MentionedSource[]): string[] {
  return mentions.map((m) => m.documentId);
}
```

- [ ] **Step 2: Write unit tests**

Create `apps/web/src/features/chat/utils/mentions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  filterSourcesByQuery,
  syncMentions,
  combineDocumentIds,
  getDocumentIdsFromMentions,
} from "./mentions";
import { Source, MentionedSource } from "@/shared/types/index";

const mockSources: Source[] = [
  { id: "1", title: "PdfViewer.tsx", type: "PDF", date: "2024-01-01", selected: true },
  { id: "2", title: "React Guide", type: "WEB", date: "2024-01-01", selected: false },
  { id: "3", title: "API Docs", type: "MD", date: "2024-01-01", selected: true },
];

describe("filterSourcesByQuery", () => {
  it("returns all sources for empty query", () => {
    expect(filterSourcesByQuery(mockSources, "")).toEqual(mockSources);
  });

  it("filters by case-insensitive substring", () => {
    expect(filterSourcesByQuery(mockSources, "pdf")).toEqual([mockSources[0]]);
    expect(filterSourcesByQuery(mockSources, "REACT")).toEqual([mockSources[1]]);
  });

  it("returns empty array when no match", () => {
    expect(filterSourcesByQuery(mockSources, "xyz")).toEqual([]);
  });
});

describe("syncMentions", () => {
  const mentions: MentionedSource[] = [
    { documentId: "1", title: "PdfViewer.tsx", startIndex: 9, endIndex: 22 },
  ];

  it("keeps valid mentions", () => {
    const text = "Explain @PdfViewer.tsx please";
    expect(syncMentions(text, mentions)).toEqual(mentions);
  });

  it("removes orphaned mentions", () => {
    const text = "Explain please";
    expect(syncMentions(text, mentions)).toEqual([]);
  });

  it("updates indices when text shifts", () => {
    const text = "Hi. Explain @PdfViewer.tsx please";
    expect(syncMentions(text, mentions)).toEqual([
      { documentId: "1", title: "PdfViewer.tsx", startIndex: 13, endIndex: 26 },
    ]);
  });
});

describe("combineDocumentIds", () => {
  it("combines and dedupes IDs", () => {
    expect(combineDocumentIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("handles empty arrays", () => {
    expect(combineDocumentIds([], ["a"])).toEqual(["a"]);
    expect(combineDocumentIds(["a"], [])).toEqual(["a"]);
    expect(combineDocumentIds([], [])).toEqual([]);
  });
});

describe("getDocumentIdsFromMentions", () => {
  it("extracts document IDs", () => {
    const mentions: MentionedSource[] = [
      { documentId: "1", title: "A", startIndex: 0, endIndex: 2 },
      { documentId: "2", title: "B", startIndex: 3, endIndex: 5 },
    ];
    expect(getDocumentIdsFromMentions(mentions)).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/web && npx vitest run src/features/chat/utils/mentions.test.ts
```

Expected: All 6 test suites pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/chat/utils/mentions.ts apps/web/src/features/chat/utils/mentions.test.ts
git commit -m "feat(chat): add mention utility functions with tests"
```

---

## Task 3: Modify useChatStream.ts

**Files:**

- Modify: `apps/web/src/features/chat/hooks/useChatStream.ts`

- [ ] **Step 1: Update handleSendMessage signature and documentIds logic**

Find the `handleSendMessage` function definition (around line 187). Change:

```typescript
const handleSendMessage = useCallback(
  async (messageText: string, deepResearch?: boolean, sourcePolicy?: { channels: string[] }) => {
```

To:

```typescript
const handleSendMessage = useCallback(
  async (
    messageText: string,
    deepResearch?: boolean,
    sourcePolicy?: { channels: string[] },
    documentIds?: string[]
  ) => {
```

Then find the documentIds assignment block (around lines 206-209):

```typescript
const hasNotebookSearch = sourcePolicy?.channels?.includes("notebook") ?? true;
const selectedDocumentIds = hasNotebookSearch
  ? sourcesRef.current.filter((source) => source.selected).map((source) => source.id)
  : [];
```

Replace with:

```typescript
const hasNotebookSearch = sourcePolicy?.channels?.includes("notebook") ?? true;
const selectedDocumentIds =
  documentIds ??
  (hasNotebookSearch
    ? sourcesRef.current.filter((source) => source.selected).map((source) => source.id)
    : []);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/chat/hooks/useChatStream.ts
git commit -m "feat(chat): accept documentIds override in handleSendMessage"
```

---

## Task 4: Modify ChatPanel.tsx

**Files:**

- Modify: `apps/web/src/features/chat/components/ChatPanel.tsx`

- [ ] **Step 1: Add imports and state**

Add to imports (around line 20):

```typescript
import { MentionedSource } from "@/shared/types/index";
import { syncMentions, combineDocumentIds, getDocumentIdsFromMentions } from "../utils/mentions";
```

Add state after `inputMessage` state (around line 94):

```typescript
const [mentionedSources, setMentionedSources] = useState<MentionedSource[]>([]);
```

- [ ] **Step 2: Update handleSendMessage to combine IDs**

Find `handleSendMessage` (around line 400). Before the `onSendMessage` call (around line 426), add:

```typescript
// Combine mentioned sources with sidebar-selected sources
const mentionedIds = getDocumentIdsFromMentions(mentionedSources);
const selectedIds = sources?.filter((s) => s.selected).map((s) => s.id) ?? [];
const combinedDocumentIds = combineDocumentIds(mentionedIds, selectedIds);
```

Then change the `onSendMessage` call from:

```typescript
onSendMessage(messageWithQuotes, deepResearchEnabled || undefined, { channels: sourceFilters });
```

To:

```typescript
onSendMessage(
  messageWithQuotes,
  deepResearchEnabled || undefined,
  { channels: sourceFilters },
  combinedDocumentIds
);
```

Also add `setMentionedSources([])` after `setInputMessage("")` to clear mentions after send (around line 425):

```typescript
setIsSending(true);
setInputMessage("");
setMentionedSources([]);
```

- [ ] **Step 3: Update handleSendChip to also combine IDs**

Find `handleSendChip` (around line 441). Before the `onSendMessage` call (around line 453), add:

```typescript
const mentionedIds = getDocumentIdsFromMentions(mentionedSources);
const selectedIds = sources?.filter((s) => s.selected).map((s) => s.id) ?? [];
const combinedDocumentIds = combineDocumentIds(mentionedIds, selectedIds);
```

Change the `onSendMessage` call from:

```typescript
onSendMessage(text, undefined, { channels: sourceFilters });
```

To:

```typescript
onSendMessage(text, undefined, { channels: sourceFilters }, combinedDocumentIds);
```

- [ ] **Step 4: Pass props to ChatInput**

Find the `<ChatInput>` JSX (around line 807). Add these props:

```typescript
            sources={sources ?? []}
            mentionedSources={mentionedSources}
            onMentionedSourcesChange={setMentionedSources}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/chat/components/ChatPanel.tsx
git commit -m "feat(chat): manage mention state and combine IDs in ChatPanel"
```

---

## Task 5: Modify ChatInput.tsx

**Files:**

- Modify: `apps/web/src/features/chat/components/ChatInput.tsx`

- [ ] **Step 1: Add imports**

Add to existing imports:

```typescript
import { Source, MentionedSource } from "@/shared/types/index";
import { filterSourcesByQuery, syncMentions } from "../utils/mentions";
import { FileText } from "lucide-react"; // Already imported, but verify
```

- [ ] **Step 2: Extend ChatInputProps interface**

Add after `quotes` prop (around line 53):

```typescript
  sources?: Source[];
  mentionedSources?: MentionedSource[];
  onMentionedSourcesChange?: (mentions: MentionedSource[]) => void;
```

- [ ] **Step 3: Destructure new props**

In the component destructuring (around line 56), add:

```typescript
  sources,
  mentionedSources,
  onMentionedSourcesChange,
```

- [ ] **Step 4: Add mention dropdown state**

Add after existing state hooks (around line 78):

```typescript
const [mentionDropdownOpen, setMentionDropdownOpen] = useState(false);
const [mentionQuery, setMentionQuery] = useState("");
const [mentionCursorIndex, setMentionCursorIndex] = useState(0);
const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
const mentionDropdownRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 5: Add click-outside handler for mention dropdown**

Add after existing click-outside useEffects (around line 124):

```typescript
// Close mention dropdown on outside click
useEffect(() => {
  if (!mentionDropdownOpen) return;
  const handleClick = (e: MouseEvent) => {
    if (
      mentionDropdownRef.current &&
      !mentionDropdownRef.current.contains(e.target as Node) &&
      textareaRef.current !== e.target
    ) {
      setMentionDropdownOpen(false);
    }
  };
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, [mentionDropdownOpen]);
```

- [ ] **Step 6: Add mention detection logic**

Create a helper function inside the component (before return statement):

```typescript
const detectMention = useCallback((text: string, cursorPos: number) => {
  // Find the last @ before cursor
  const textBeforeCursor = text.slice(0, cursorPos);
  const lastAtIndex = textBeforeCursor.lastIndexOf("@");

  if (lastAtIndex === -1) return null;

  // Check if there's a space between @ and cursor (which means we're not in a mention)
  const textBetweenAtAndCursor = textBeforeCursor.slice(lastAtIndex + 1);
  if (textBetweenAtAndCursor.includes(" ")) return null;

  // Make sure @ is at the start of the word (preceded by space or start of string)
  const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
  if (charBeforeAt && charBeforeAt !== " " && charBeforeAt !== "\n") return null;

  return {
    query: textBetweenAtAndCursor,
    startIndex: lastAtIndex,
  };
}, []);
```

- [ ] **Step 7: Update handleKeyDown for mention navigation**

Modify the `handleKeyDown` callback (around line 126) to handle mention dropdown keyboard nav:

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionDropdownOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedMentionIndex((prev) => (prev < filteredSources.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedMentionIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filteredSources.length > 0) {
          selectMention(filteredSources[highlightedMentionIndex]);
        }
        return;
      }
      if (e.key === "Escape" || e.key === "Tab") {
        setMentionDropdownOpen(false);
        if (e.key === "Escape") e.preventDefault();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  },
  [onSend, mentionDropdownOpen, filteredSources, highlightedMentionIndex]
);
```

- [ ] **Step 8: Add mention selection logic**

Add before the return statement:

```typescript
const selectMention = useCallback(
  (source: Source) => {
    if (!textareaRef.current || !onMentionedSourcesChange || !mentionedSources) return;

    const cursorPos = textareaRef.current.selectionStart;
    const text = value;
    const mentionInfo = detectMention(text, cursorPos);

    if (!mentionInfo) return;

    const mentionText = `@${source.title}`;
    const newText = text.slice(0, mentionInfo.startIndex) + mentionText + text.slice(cursorPos);

    onChange(newText);

    const newMention: MentionedSource = {
      documentId: source.id,
      title: source.title,
      startIndex: mentionInfo.startIndex,
      endIndex: mentionInfo.startIndex + mentionText.length,
    };

    onMentionedSourcesChange([...mentionedSources, newMention]);
    setMentionDropdownOpen(false);
    setMentionQuery("");

    // Focus textarea and position cursor after the mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionInfo.startIndex + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    });
  },
  [value, onChange, mentionedSources, onMentionedSourcesChange, detectMention]
);

const filteredSources = filterSourcesByQuery(sources ?? [], mentionQuery);
```

- [ ] **Step 9: Update onChange handler to detect mentions**

Modify the textarea's `onChange` prop (around line 164):

```typescript
          onChange={(e) => {
            const newValue = e.target.value;
            const cursorPos = e.target.selectionStart;
            onChange(newValue);

            // Sync mentions with new text
            if (mentionedSources && onMentionedSourcesChange) {
              const synced = syncMentions(newValue, mentionedSources);
              if (synced.length !== mentionedSources.length) {
                onMentionedSourcesChange(synced);
              }
            }

            // Detect if we're in a mention
            const mentionInfo = detectMention(newValue, cursorPos);
            if (mentionInfo) {
              setMentionQuery(mentionInfo.query);
              setMentionCursorIndex(cursorPos);
              setMentionDropdownOpen(true);
              setHighlightedMentionIndex(0);
            } else {
              setMentionDropdownOpen(false);
            }
          }}
```

- [ ] **Step 10: Add mention dropdown JSX**

After the `<textarea>` element and before the bottom toolbar div (around line 167), insert:

```typescript
        {/* Mention dropdown */}
        {mentionDropdownOpen && filteredSources.length > 0 && (
          <div
            ref={mentionDropdownRef}
            className="absolute left-3 z-50 w-64 max-h-60 overflow-y-auto bg-card border-2 border-border rounded-xl shadow-lg"
            style={{
              top: `${Math.min(
                (textareaRef.current?.scrollHeight ?? 44) + 8,
                160
              )}px`,
            }}
          >
            {filteredSources.map((source, index) => (
              <button
                key={source.id}
                type="button"
                onClick={() => selectMention(source)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  index === highlightedMentionIndex
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted/80"
                }`}
              >
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{source.title}</span>
              </button>
            ))}
          </div>
        )}
        {mentionDropdownOpen && filteredSources.length === 0 && (
          <div
            ref={mentionDropdownRef}
            className="absolute left-3 z-50 w-64 bg-card border-2 border-border rounded-xl shadow-lg px-3 py-2.5 text-sm text-muted-foreground"
            style={{
              top: `${Math.min(
                (textareaRef.current?.scrollHeight ?? 44) + 8,
                160
              )}px`,
            }}
          >
            No sources found
          </div>
        )}
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/chat/components/ChatInput.tsx
git commit -m "feat(chat): add @source mention autocomplete to ChatInput"
```

---

## Task 6: Verification

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck:web
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: No ESLint errors.

- [ ] **Step 3: Run unit tests**

```bash
cd apps/web && npx vitest run src/features/chat/utils/mentions.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(chat): implement @source mentions for attaching sources to chat"
```

---

## Spec Coverage Checklist

| Spec Requirement                         | Implementing Task                             |
| ---------------------------------------- | --------------------------------------------- |
| Typing `@` opens dropdown                | Task 5, Step 9-10                             |
| Selecting source inserts `@Source Title` | Task 5, Step 8                                |
| Mention supplements sidebar selection    | Task 4, Step 2                                |
| Raw text with @mentions sent to LLM      | Task 4, Step 2 (message text unchanged)       |
| Orphaned mentions cleaned up on edit     | Task 5, Step 9 (syncMentions on every change) |
| Keyboard nav (↑/↓/Enter/Esc/Tab)         | Task 5, Step 7                                |
| Mobile support                           | Task 5, Step 10 (responsive dropdown)         |
| Deduplication of IDs                     | Task 2, Step 1 (combineDocumentIds)           |

## Placeholder Scan

- No TBD/TODO/fill-in-details found
- All code blocks contain complete implementations
- Type names consistent across all tasks

---

**Plan saved to:** `docs/superpowers/plans/2026-05-04-chat-source-mentions.md`
