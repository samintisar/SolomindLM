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
import type React from "react";

export const SOURCE_FILTERS = [
  { id: "notebook", label: "Notebook sources", icon: BookOpen },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "web", label: "Web", icon: Globe },
  { id: "news", label: "News", icon: Newspaper },
  { id: "finance", label: "Finance", icon: TrendingUp },
] as const;

/** Default source channels when the composer is in Chat mode. */
export const CHAT_DEFAULT_SOURCE_FILTERS = ["notebook"] as const;

/** Default source channels when the composer is in Deep Research mode. */
export const DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS = ["notebook", "web", "academic"] as const;

export type ChatComposerMode = "chat" | "deepResearch" | "literatureReview";

export type ResearchDatabaseOption = "all" | "pubmed" | "arxiv";

export const COMPOSER_MODES: {
  id: ChatComposerMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "deepResearch", label: "Deep Research", icon: Telescope },
  { id: "literatureReview", label: "Literature Review", icon: FileText },
];

export const RESEARCH_DATABASES: {
  id: ResearchDatabaseOption;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
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
];
