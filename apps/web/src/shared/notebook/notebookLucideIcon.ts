import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Book,
  Brain,
  FileText,
  Globe,
  GraduationCap,
  Lightbulb,
  Monitor,
  Search,
} from "lucide-react";

/**
 * Icon names persisted in Convex (`notebooks.icon`). The folder glyph is reserved for folders,
 * so notebooks don't offer it; notebooks created before that was the case may still store
 * "Folder" and are rendered with the notebook default instead.
 */
const NOTEBOOK_LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  Book,
  BarChart: BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
};

export const DEFAULT_NOTEBOOK_ICON = "Book";

/** Icons offered by the notebook icon picker, in display order. */
export const NOTEBOOK_ICON_OPTIONS = Object.keys(NOTEBOOK_LUCIDE_ICON_MAP);

/** Maps a stored icon name to one the notebook picker offers (missing, legacy "Folder" → default). */
export function normalizeNotebookIcon(icon?: string | null): string {
  if (icon && Object.hasOwn(NOTEBOOK_LUCIDE_ICON_MAP, icon)) return icon;
  return DEFAULT_NOTEBOOK_ICON;
}

export function getNotebookLucideIcon(icon?: string | null): LucideIcon {
  return NOTEBOOK_LUCIDE_ICON_MAP[normalizeNotebookIcon(icon)];
}
