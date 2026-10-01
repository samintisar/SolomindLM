import {
  BarChart3,
  Book,
  Brain,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  Lightbulb,
  type LucideIcon,
  Monitor,
  Search,
} from "lucide-react";

/** Icon names are persisted in Convex (`notebooks.icon`, `folders.icon`); never rename a key. */
export const COVER_ICONS = {
  Folder,
  Book,
  BarChart: BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
} satisfies Record<string, LucideIcon>;

export type CoverIconName = keyof typeof COVER_ICONS;

export const DEFAULT_NOTEBOOK_ICON: CoverIconName = "Book";
export const DEFAULT_FOLDER_ICON: CoverIconName = "Folder";

/** The notebook picker never offers "Folder", so notebooks can't be mistaken for folders (#226). */
export const NOTEBOOK_ICON_NAMES = [
  "Book",
  "BarChart",
  "Monitor",
  "Search",
  "Brain",
  "Globe",
  "FileText",
  "GraduationCap",
  "Lightbulb",
] as const satisfies readonly CoverIconName[];

export const FOLDER_ICON_NAMES = [
  "Folder",
  ...NOTEBOOK_ICON_NAMES,
] as const satisfies readonly CoverIconName[];

export const isCoverIconName = (icon: string): icon is CoverIconName =>
  Object.hasOwn(COVER_ICONS, icon);

/** "Folder" was the old notebook default; it, and missing/unknown names, render as Book. */
export function notebookIconName(icon?: string | null): CoverIconName {
  if (!icon || icon === "Folder" || !isCoverIconName(icon)) return DEFAULT_NOTEBOOK_ICON;
  return icon;
}

export function folderIconName(icon?: string | null): CoverIconName {
  return icon && isCoverIconName(icon) ? icon : DEFAULT_FOLDER_ICON;
}

export const notebookIcon = (icon?: string | null): LucideIcon =>
  COVER_ICONS[notebookIconName(icon)];
export const folderIcon = (icon?: string | null): LucideIcon => COVER_ICONS[folderIconName(icon)];
