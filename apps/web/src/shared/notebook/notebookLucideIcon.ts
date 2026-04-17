import type { LucideIcon } from "lucide-react";
import {
  Folder,
  Book,
  BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
} from "lucide-react";

const NOTEBOOK_LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
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
};

export function getNotebookLucideIcon(icon?: string | null): LucideIcon {
  if (!icon) return Folder;
  return NOTEBOOK_LUCIDE_ICON_MAP[icon] ?? Folder;
}
