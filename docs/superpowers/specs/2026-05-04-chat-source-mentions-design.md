# Design: `@source` Mentions in Chat

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** Frontend only (web app) — no Convex schema changes

---

## 1. Problem

Users want to attach specific sources to chat messages by typing `@filename`, similar to mention systems in Slack/Discord/Notion. When a user types `@`, a dropdown should suggest notebook sources. On selection, the source title is inserted as plain text (`@Source Title`) and the source is added to the RAG retrieval set for that message. The raw message text (including `@Source Title`) is sent to the LLM as-is.

## 2. Goals

1. Typing `@` in the chat input opens an autocomplete dropdown of notebook sources.
2. Selecting a source inserts `@Source Title` into the textarea.
3. The mentioned source supplements (does not replace) the sidebar-selected sources for RAG.
4. The raw message text with `@mentions` is preserved and sent to the LLM.
5. If the user edits the message and breaks a mention, the orphaned mention is cleaned up.

## 3. Architecture

### 3.1 Components

| Component          | Change | Description                                                                                                   |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------- |
| `ChatInput.tsx`    | Major  | Detect `@` trigger, render dropdown, handle keyboard nav, insert mention text, track `mentionedSources` state |
| `ChatPanel.tsx`    | Minor  | Maintain `mentionedSources` state; pass into `ChatInput`; combine with sidebar-selected IDs on send           |
| `useChatStream.ts` | Minor  | Accept `documentIds` override in `handleSendMessage`; pass through to `sendMessage`                           |
| `chatApi.ts`       | None   | No changes — already accepts `documentIds?: string[]`                                                         |

### 3.2 Types

```ts
// apps/web/src/shared/types/index.ts (or local to chat)
interface MentionedSource {
  documentId: string;
  title: string;
  startIndex: number; // position of '@' in the text
  endIndex: number; // position after title
}
```

### 3.3 State Management

- **`ChatPanel.tsx`** owns `mentionedSources: MentionedSource[]` state.
- **`ChatInput.tsx`** receives `mentionedSources` + `onMentionedSourcesChange` as props.
- On every `onChange`, `ChatInput` re-scans the text for `@Title` patterns and syncs `mentionedSources` (removing entries whose text no longer matches).

### 3.4 Data Flow

```
User types "Explain @pdfviewer"
  → ChatInput detects "@", sets mentionQuery="pdfviewer", opens dropdown
  → Filters sources from props.sources where title includes "pdfviewer" (case-insensitive)
  → Renders dropdown with keyboard nav (↑/↓/Enter/Esc)

User selects "PdfViewer.tsx" (documentId: "abc123")
  → ChatInput inserts "@PdfViewer.tsx" at cursor position
  → ChatInput appends { documentId: "abc123", title: "PdfViewer.tsx", startIndex: 9, endIndex: 21 }
    to mentionedSources via onMentionedSourcesChange
  → Dropdown closes, textarea regains focus

User edits text (deletes "PdfViewer.tsx")
  → onChange re-scans text, detects mismatch at startIndex 9
  → Removes orphaned mention from mentionedSources

User presses Enter
  → ChatPanel.handleSendMessage()
    1. Reads mentionedSources → documentIds: ["abc123"]
    2. Reads sidebar selected sources → ["xyz789"]
    3. Combines & dedupes → ["abc123", "xyz789"]
    4. Calls onSendMessage(messageText, deepResearch, sourcePolicy, combinedDocumentIds)
  → useChatStream.handleSendMessage()
    1. If documentIds param is provided, use it instead of computing from sourcesRef.current
    2. Passes to sendMessage()
  → chatApi.sendMessage()
    1. POST to /chat/stream with { message, documentIds: [...] }
  → Backend retrieves chunks from all listed documents
  → LLM sees raw text: "Explain @PdfViewer.tsx"
```

## 4. UI/UX Details

### 4.1 Dropdown Behavior

- **Trigger:** Typing `@` followed by any character (or immediately, for empty query showing all sources).
- **Position:** Absolute, positioned below the cursor line within the textarea container.
- **Max height:** 240px with scroll.
- **Item format:** Source icon (based on `source.type`) + title.
- **Empty state:** "No sources found".
- **Keyboard:**
  - `↑` / `↓` — navigate items
  - `Enter` — select highlighted item
  - `Esc` — close dropdown
  - `Tab` — close dropdown (do not select)
- **Mouse:** Click to select; click outside to close (existing `useEffect` pattern).

### 4.2 Mention Insertion

- Replace the `@query` text with `@Source Title`.
- Update cursor position to after the inserted text.
- Add to `mentionedSources` with correct `startIndex` / `endIndex`.

### 4.3 Mention Cleanup

On every `onChange`:

1. Iterate `mentionedSources`.
2. For each entry, check if `text.slice(startIndex, endIndex) === '@' + title`.
3. If not, remove the entry from `mentionedSources`.
4. If yes but indices shifted (e.g., user typed before the mention), re-scan the text to find the new position of `'@' + title` and update indices.

### 4.4 Mobile

- Dropdown renders full-width below the input.
- Touch-friendly item height (44px min).

## 5. Backend Contract

No backend changes. The existing `documentIds?: string[]` parameter in `sendMessage` and the `/chat/stream` endpoint already supports passing a specific set of document IDs for RAG.

## 6. Edge Cases

| Case                                      | Behavior                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| User types `@` with no sources            | Show "No sources found"                                                                  |
| Mentioned source is also sidebar-selected | Deduped before sending                                                                   |
| User deletes part of a mention            | Orphaned mention removed on next `onChange`                                              |
| User copies/pastes text with `@`          | Re-scan on paste; only valid mentions are tracked                                        |
| Deep research enabled                     | Same behavior; combined IDs passed to backend                                            |
| Multiple `@` triggers                     | Each `@` opens a new dropdown; previous mention is preserved                             |
| Source title contains special chars       | Exact match; if user edits the title manually, mention becomes invalid and is cleaned up |

## 7. Testing Plan

### 7.1 Unit Tests (vitest)

- **`filterSourcesByQuery(sources, query)`**: case-insensitive substring matching, empty query returns all.
- **`syncMentions(text, mentionedSources)`**: validates and updates indices after text edits.
- **`combineDocumentIds(mentionedIds, selectedIds)`**: deduplication, empty arrays handled.

### 7.2 Integration Tests (Playwright)

- Type `@` → see dropdown → select source → verify textarea contains `@Source Title`.
- Send message → verify network request includes correct `documentIds`.
- Edit message to break mention → verify `documentIds` no longer includes the orphaned source.

## 8. Files to Modify

| File                                                  | Lines | Change                                                                 |
| ----------------------------------------------------- | ----- | ---------------------------------------------------------------------- |
| `apps/web/src/features/chat/components/ChatInput.tsx` | ~+200 | Add mention detection, dropdown, keyboard nav, state                   |
| `apps/web/src/features/chat/components/ChatPanel.tsx` | ~+30  | Add `mentionedSources` state, pass to `ChatInput`, combine IDs on send |
| `apps/web/src/features/chat/hooks/useChatStream.ts`   | ~+10  | Accept `documentIds` param, use it if provided                         |
| `apps/web/src/shared/types/index.ts`                  | ~+10  | Add `MentionedSource` interface                                        |

## 9. Open Questions

None — all clarified with the user.

---

**Approved by:** User on 2026-05-04
