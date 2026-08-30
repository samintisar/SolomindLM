# Notebook and Folder Cover Color — Design Spec

**Date:** 2026-08-30
**Status:** Approved

## Overview

Home-page notebook and folder **covers** look white even when a vintage swatch is stored. Cover color is never `white`; the cards paint `bg-card` and apply the swatch with Tailwind v3 `bg-opacity-[4%]` / `[3%]`, which Tailwind v4 does not compose with custom CSS-variable colors. The stored class is either ignored or overridden, so the cream card shows through.

This spec makes covers **solid swatch color** on the top half (and on list-row chips), with contrast-safe ink for icons. Open notebook chrome, chat, studio, and reports are out of scope.

## Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Scope | Notebook + folder covers only | User clarification; interior views stay as they are |
| Intensity | Solid fill (picker swatch at 100%) | Option C; 4% wash was both broken and invisible |
| Approach | Shared cover helper | One API so grid, list, folders, featured chips, and customize preview cannot drift |
| Icon on cover | `text-foreground` | Matching `text-vintage-*-*` on the same hue disappears; dark ink stays readable on 200–500 swatches |
| Open notebook | Unchanged | Not a cover |

## 1. Problem

Stored value: `coverColor` / `color` like `bg-vintage-brown-300` (default when missing).

Painted today:

- Grid top 55%: `` `${cover} bg-opacity-[4%]` `` on a `bg-card` parent
- List chips: `` `${cover} bg-opacity-[3%]` ``
- Icon: `` cover.replace("bg-", "text-") `` at 50–55% opacity
- Customize preview: `bg-opacity-25` (same broken composition)

Tailwind v4 background opacity is the slash modifier (`bg-vintage-brown-300/25`), not a separate `bg-opacity-*` class. Custom vintage colors are full `hsl(...)` tokens and do not use `--tw-bg-opacity`. Result: white/cream covers.

## 2. Helper

Add `apps/web/src/shared/notebook/coverColor.ts` next to `notebookLucideIcon.ts`.

```ts
export const DEFAULT_COVER_COLOR = "bg-vintage-brown-300";
export const COVER_ICON_CLASS = "text-foreground";

export function coverFillClass(coverColor?: string | null): string {
  return coverColor?.startsWith("bg-") ? coverColor : DEFAULT_COVER_COLOR;
}
```

- `coverFillClass` is the only fill class on cover surfaces. No `bg-opacity-*`.
- `COVER_ICON_CLASS` is the only icon color on those surfaces. No `replace("bg-", "text-")`, no extra icon opacity.

Keep `COVER_COLORS` arrays in the customize modals; this helper does not own the picker palette.

## 3. Call sites

| Surface | Change |
| -------- | ------ |
| `NotebookCardGrid` top half | `coverFillClass(notebook.coverColor)`; icon `COVER_ICON_CLASS` |
| `NotebookCardList` / `ListInFolder` chips | same |
| `FolderCard` grid top + list chip | `coverFillClass(folder.color)`; icon `COVER_ICON_CLASS` |
| `FeaturedSection` list chip | same (featured **grid** already uses full-bleed color; leave it) |
| `CustomizeNotebookModal` / `CustomizeFolderModal` preview | solid fill + `COVER_ICON_CLASS` so the preview matches home |
| `MoveToFolderModal` folder chip | solid fill + `COVER_ICON_CLASS` (same opacity bug) |

Kebab on the colored half stays `text-foreground` / existing hover (`hover:bg-black/10`). Bottom 45% of grid cards stays `bg-card` with title and counts.

## 4. Tests

Unit-test `coverFillClass`: missing / empty / non-`bg-` → default; valid `bg-vintage-blue-400` → unchanged.

No Playwright. Visual check: home grid + list, a folder card, customize preview.

## 5. Out of scope

- Tinting chat, sources, studio, or report paper
- Changing stored color values or the picker swatch list
- Migrating existing Convex rows (already store the right class names)
