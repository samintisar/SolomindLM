import type { LucideIcon } from "lucide-react";
import {
  Atom,
  BookOpen,
  BriefcaseMedical,
  FileText,
  Globe,
  GraduationCap,
  MessageCircle,
  Newspaper,
  Telescope,
  TrendingUp,
} from "lucide-react";

export const SOURCE_FILTERS = [
  { id: "notebook", label: "Notebook sources", icon: BookOpen },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "web", label: "Web", icon: Globe },
  { id: "news", label: "News", icon: Newspaper },
  { id: "finance", label: "Finance", icon: TrendingUp },
] as const;

export type SourceFilterId = (typeof SOURCE_FILTERS)[number]["id"];

export function isSourceFilterId(value: unknown): value is SourceFilterId {
  return SOURCE_FILTERS.some((f) => f.id === value);
}

/** Default source channels when the composer is in Chat mode. */
export const CHAT_DEFAULT_SOURCE_FILTERS = ["notebook"] as const;

/** Default source channels when the composer is in Deep Research mode. */
export const DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS = ["notebook", "web", "academic"] as const;

export const COMPOSER_MODES = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "deepResearch", label: "Deep Research", icon: Telescope },
  { id: "literatureReview", label: "Literature Review", icon: FileText },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type ChatComposerMode = (typeof COMPOSER_MODES)[number]["id"];

export function isComposerMode(value: unknown): value is ChatComposerMode {
  return COMPOSER_MODES.some((m) => m.id === value);
}

export const RESEARCH_DATABASES = [
  {
    id: "all",
    title: "All Papers",
    description: "Search from 200M+ research papers",
    icon: BookOpen,
  },
  {
    id: "pubmed",
    title: "PubMed",
    description: "39M+ biomedical and life-science literature",
    icon: BriefcaseMedical,
  },
  {
    id: "arxiv",
    title: "ArXiv",
    description: "Explore research preprints from arXiv",
    icon: Atom,
  },
] as const satisfies readonly {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[];

export type ResearchDatabaseOption = (typeof RESEARCH_DATABASES)[number]["id"];

export function isResearchDatabase(value: unknown): value is ResearchDatabaseOption {
  return RESEARCH_DATABASES.some((d) => d.id === value);
}
