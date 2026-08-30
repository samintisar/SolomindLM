# Notebook Panel Resize (Touch + Pointer) — Design Spec

**Date:** 2026-08-29
**Status:** Approved

## Overview

Notebook view shows a three-column desktop layout (Sources | Chat | Studio) from the Tailwind `md` breakpoint (768px). Most iPads therefore get the desktop split, not the phone tab layout. Resize currently does not work with touch: handles listen only to mouse events, hit targets are ~4–6px, and three separate implementations fight each other over `window` custom events.

This spec replaces those implementations with `react-resizable-panels` (v4 API: `Group` / `Panel` / `Separator`) so mouse, finger, and Apple Pencil share one pointer-capture path, and layout ownership lives in one place.

## Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Approach | Migrate to `react-resizable-panels` v4 | Consolidates three mouse-only resize paths; library already handles pointer capture, keyboard, min/max |
| Wrapper | Direct dependency, no shadcn `Resizable` | `apps/web` has no `components/ui`; extra wrapper adds no value |
| Closed studio | Unmount the right `Panel` (current behavior) | Closing studio today returns `null`; keep that so studio internal state is discarded |
| Closed sources | Keep mounted; collapse the left `Panel` to 0 | Sources stays in the tree today at `width: 0`; collapsing preserves viewer/list state |
| Width persistence | In-memory only (match today) | `usePanelResize` is `useState`, not localStorage. Do not add `autoSaveId` |
| Phone layout | Unchanged `md:hidden` tabs | Resize is a desktop/iPad split-pane problem; phones stay full-width tabs |
| Hit target | Library separator, styled as a 1px gutter | Visual stays desktop-thin; library provides the fat pointer hit area |

## 1. Problem (current code)

Resize is implemented three times, all mouse-only:

1. **`usePanelResize`** (`apps/web/src/shared/hooks/usePanelResize.ts`) — `mousedown` / `mousemove` / `mouseup` on `window`. Used by gutter divs in `NotebookView`.
2. **`SourcesPanel.handleResizeStart`** — another mouse drag that dispatches `resizeSourcesPanel`. Wired through `SourcesPanelHeader` (`onMouseDown`, `absolute` 6px handle on the panel’s right edge).
3. **`ResizeHandle`** (`apps/web/src/features/studio/components/ResizeHandle.tsx`) — mouse drag that dispatches `resizeStudioPanel`. Mounted inside `StudioPanel`, `LiteratureStudioView`, `LiteraturePapersPanel`, and `LiteratureScreeningPanel`.

`usePanelResize` then listens for those custom events and sets `leftWidth` / `rightWidth`. Desktop `NotebookView` also renders its own gutters. Result: duplicate handles, event-bus coupling, no pointer capture, no `touch-action: none`, and a parent `overflow-x-auto` that steals horizontal drags on iPad.

`isResizing` is passed into several panels but unused (`_isResizing`).

## 2. Target architecture

Desktop notebook row (`hidden md:flex`, `md+`) becomes a single horizontal group. The group **is** the layout; children fill the panel (`h-full w-full`). No pixel `width` style on Sources/Studio/Chat.

```text
<Group orientation="horizontal">
  <Panel id="sources" collapsible>  <!-- stays mounted; collapse() when closed -->
    <SourcesPanel />
  </Panel>
  <Separator />                      <!-- hide or disable while sources collapsed -->
  <Panel id="chat">
    <ChatPanel />
  </Panel>
  <!-- Right column only when studio is open AND notebook id exists -->
  <Separator />
  <Panel id="studio">
    {literature view | StudioPanel}
  </Panel>
</Group>
```

Literature vs studio is a **swap inside** the right `Panel`. Do not remount `Group` when switching `activeLiteratureView`.

Phone layout (`md:hidden`) stays the existing tab switcher. `SourcesPanel` / studio / chat there already use full width (`flex-1 w-full`); they must not depend on desktop pixel widths.

## 3. Size constraints

Match today’s numbers, expressed in the library’s pixel units:

| Panel | Default | Min | Max |
| ----- | ------- | --- | --- |
| Sources | `360px` | `220px` | `70%` of the group |
| Chat | remaining space | `280px` (`min-w-70` today) | none (flex) |
| Studio | `420px` | `220px` | `70%` of the group |

Chat is the flexible middle panel: it takes leftover space after the pixel-sized side panels. Do not give chat a fixed `defaultSize`; if the library requires an explicit size, use the remaining percentage so sources `360px` + studio `420px` + chat fill 100% of the group.

When studio **unmounts**, the group gives its space to chat. When it **remounts**, restore the last dragged studio size (today `rightWidth` lives in `NotebookView` and survives close). Keep `studioDefaultSize` in `NotebookView` as a **pixel** number (initial `420`). Update it from the studio panel’s `onResize` using the callback’s pixel width (or `panelRef.getSize("px")`), and pass `defaultSize={`${studioDefaultSize}px`}` on remount. Sources stay mounted, so the library keeps their size across collapse/expand.

Do not persist sizes to `localStorage`.

## 4. Open / close

Chat already exposes `toggleLeft` / `toggleRight`. Those keep working.

**Sources**

- State: `isSourcesOpen` (existing).
- Ref: `usePanelRef()` on the sources `Panel` (`collapsible`, `collapsedSize={0}`).
- Toggle: `collapse()` / `expand()`.
- Separator between sources and chat: do not offer a drag-to-restore affordance in v1. Hide or disable it while collapsed so closed sources looks like today (no gutter). Reopen only via the existing chat toggle.

**Studio**

- State: `isStudioOpen` (existing).
- Closed: do not render the studio `Panel` or its `Separator` (`renderRightPanel()` returning `null` today). Children unmount.
- Open: render `Separator` + `Panel` with `defaultSize={studioDefaultSize}`.

Do not use `collapsible` on studio. Collapse-while-mounted would change behavior (studio state would survive close).

## 5. Component API changes

### `NotebookView`

- Replace `usePanelResize` and the two gutter `div`s with `Group` / `Panel` / `Separator`.
- Remove `overflow-x-auto` from the desktop row. The group owns overflow; horizontal page-pan was a workaround for overflowing pixel columns.
- Keep `isSourcesOpen` / `isStudioOpen` and the chat toggle callbacks.
- Keep `renderRightPanel()` as “which right-column child”, but drop `width` / `isResizing` arguments. The child is stretched by the panel.

### Panel components (Sources, Studio, literature)

Remove layout-resize props and in-panel handles:

| Remove | From |
| ------ | ---- |
| `width`, `isResizing` props | `SourcesPanel`, `StudioPanel`, `LiteratureStudioView`, `LiteraturePapersPanel`, `LiteratureScreeningPanel` |
| `onResizeStart` prop and the absolute handle | `SourcesPanelHeader` |
| `handleResizeStart` + `resizeSourcesPanel` dispatch | `SourcesPanel` |
| `ResizeHandle` usage and file | studio / literature panels; delete `ResizeHandle.tsx` |
| `resizeSourcesPanel` / `resizeStudioPanel` listeners | `usePanelResize.ts` (file deleted) |

`SourcesPanel` / `StudioPanel` still take `isOpen` / `onClose` where those mean “user dismissed the panel”, not “set my pixel width.” Desktop width comes only from the parent `Panel`.

Mobile: `SourcesPanel` currently does `isOpen ? (isMobile ? "100%" : width) : 0`. After this change, mobile wrappers already set `flex-1 w-full`; the panel should be `h-full w-full` and not set its own width.

### Shared hook

Delete `apps/web/src/shared/hooks/usePanelResize.ts`. Nothing else imports it.

## 6. Separator appearance

Style the library `Separator` to match the current gutter:

- Visual: 1px (`w-px`) track, `hover:bg-primary/50`, `cursor-col-resize`.
- No hover-only widening as the sole hit target (that fails on touch). Rely on the library hit slop.
- Coarse pointers may use a slightly more visible track (`@media (pointer: coarse)` → 2px) without changing desktop aesthetics.

Do not add a visible “grip dots” control in v1.

## 7. Dependency

Add `react-resizable-panels` to `apps/web/package.json`. Use the **v4** import surface:

```ts
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
```

Do not import v3 names (`PanelGroup`, `PanelResizeHandle`). Pin a v4 range so a v5 rename does not land unreviewed.

## 8. Error handling and edge cases

- Missing `urlNotebookId`: same as today — no right column.
- Sources collapsed + studio closed: chat fills the group. Chat min size still applies.
- Viewport resize: library relayouts; keep max `70%` so one side cannot swallow the group.
- Pointer cancel (iPad gesture stolen, pencil hover): library handles `pointerup` / `pointercancel`. Do not add parallel `touch*` listeners.
- Nested scroll inside a panel (source list, chat, studio): vertical scroll must keep working; only the separator has non-default `touch-action`.

## 9. Testing

This is a UI layout change. Do not unit-test prompt-like output or pixel-perfect drag math.

- Update `SourcesPanelHeader.test.tsx` so it no longer passes `onResizeStart`.
- Remove or stop requiring `width` / `isResizing` in any panel tests that construct those props.
- Playwright (if a notebook desktop spec exists, extend it; otherwise a focused spec): at `md+` viewport, drag the sources separator and assert the sources column width changes; drag the studio separator similarly. Pointer-based drag in Playwright covers the same path iPad uses.
- Manual: iPad Safari or Chrome device mode (iPad, touch), Expo WebView if convenient — drag both gutters, confirm chat still scrolls vertically, confirm close/open sources (state kept) and close/open studio (state cleared).

Verification gates: `bun run typecheck:web`, `bun run lint`, `bun run test:web` (header/panel tests). No Convex changes.

## 10. Out of scope

- Changing the `md` breakpoint or giving iPads the phone tab layout
- Persisting panel sizes across reloads
- Nested splits inside studio or sources
- Drag-to-restore a collapsed sources panel from the separator
- Keyboard-only documentation beyond what the library Separator already exposes
- React Native native split views (mobile app remains a WebView of this web layout)
