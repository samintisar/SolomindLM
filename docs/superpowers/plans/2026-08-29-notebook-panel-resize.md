# Notebook Panel Resize Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace mouse-only notebook split-pane resizing with `react-resizable-panels` v4 so iPad/touch can drag Sources | Chat | Studio.

**Architecture:** Desktop (`md+`) `NotebookView` owns a single `Group`. Side panels fill their `Panel` (`h-full w-full`). Closed studio unmounts; closed sources stay mounted and collapse to 0. Phone tabs are unchanged.

**Tech Stack:** React 19, Vite, Tailwind 4, `react-resizable-panels` v4 (`Group` / `Panel` / `Separator` / `usePanelRef`).

**Files:**
- Add: `apps/web/src/features/notebooks/components/views/NotebookPanelSeparator.tsx`
- Modify: `NotebookView.tsx`, `SourcesPanel.tsx`, `SourcesPanelHeader.tsx` (+ test), `StudioPanel.tsx`, `NoteListView.tsx`, `ToolGrid.tsx`, `Literature*.tsx`, `AuthPage.tsx`, `LandingHeroMockup.tsx`, `studio/components/index.ts`, `apps/web/package.json`
- Delete: `apps/web/src/shared/hooks/usePanelResize.ts`, `apps/web/src/features/studio/components/ResizeHandle.tsx`

---

### Task 1: Dependency

- [ ] `bun add react-resizable-panels` in `apps/web` (v4 range)

### Task 2: Separator + NotebookView

- [ ] Styled `Separator` (1px track, coarse 2px, library hit slop)
- [ ] Sources: collapsible `Panel`, `collapse()`/`expand()` from chat toggle; hide separator when closed
- [ ] Studio: unmount `Panel`+`Separator` when closed; restore last pixel `defaultSize`
- [ ] Drop `overflow-x-auto`; delete `usePanelResize`

### Task 3: Strip panel chrome resize APIs

- [ ] Remove `width` / `isResizing` / in-panel handles / `window` custom events
- [ ] ToolGrid: container queries instead of `width > 450`
- [ ] Delete `ResizeHandle.tsx`

### Task 4: Tests + verify

- [ ] `SourcesPanelHeader.test.tsx` drop `onResizeStart`
- [ ] `bun run typecheck:web`, `bun run lint`, `bun run test:web`
