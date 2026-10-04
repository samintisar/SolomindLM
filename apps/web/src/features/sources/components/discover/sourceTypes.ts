import { Globe, GraduationCap, Newspaper, TrendingUp } from "lucide-react";
import type { UnifiedDiscoveryResult } from "@/shared/types/index";

export type SourceType = UnifiedDiscoveryResult["sourceType"];

/** Icon and label per discovery source type, shared by the toolbar toggles and the result rows. */
export const SOURCE_TYPE_META = {
  web: { label: "Web", icon: Globe },
  news: { label: "News", icon: Newspaper },
  academic: { label: "Academic", icon: GraduationCap },
  finance: { label: "Finance", icon: TrendingUp },
} as const satisfies Record<SourceType, { label: string; icon: typeof Globe }>;

export const SOURCE_TYPES = Object.keys(SOURCE_TYPE_META) as SourceType[];
