import {
  AudioLines,
  FileText,
  GitFork,
  HelpCircle,
  Image,
  Layers,
  type LucideIcon,
  MessageSquareText,
  Table2,
} from "lucide-react";
import type React from "react";
import { useShowProBadges } from "@/features/billing/hooks/useShowProBadges";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { StudioTool } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";

interface ToolGridProps {
  tools: StudioTool[];
  onToolClick: (toolId: string) => void;
  /** When set, that tool card shows a selection ring (e.g. marketing preview). */
  activeToolId?: string | null;
}

const IconMap: Record<string, LucideIcon> = {
  AudioLines,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  Image,
  MessageSquareText,
  Table2,
};

/** Studio tools that Free users can't run (see FREE_FEATURE_LIMITS in convex/_lib/errors.ts). */
const PRO_ONLY_TOOL_IDS = new Set(["infographic"]);

/**
 * ToolGrid component displays creation tool cards in a responsive grid.
 */
export const ToolGrid: React.FC<ToolGridProps> = ({ tools, onToolClick, activeToolId }) => {
  const showProBadges = useShowProBadges();
  return (
    <div
      className="@container space-y-3"
      data-onboarding="studio-tool-grid"
      data-testid="studio-tool-grid"
    >
      <h3 className="px-1 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Create
      </h3>
      <div className="grid grid-cols-2 gap-3 @min-[450px]:grid-cols-3">
        {tools.map((tool) => {
          const Icon = IconMap[tool.iconName] ?? FileText;
          const isActive = activeToolId != null && activeToolId === tool.id;
          const proOnly = showProBadges && PRO_ONLY_TOOL_IDS.has(tool.id);
          return (
            <Card key={tool.id} variant="interactive" data-selected={isActive || undefined}>
              <button
                type="button"
                aria-label={proOnly ? `${tool.label} (Pro)` : tool.label}
                onClick={() => onToolClick(tool.id)}
                className="group flex h-22 flex-col justify-between rounded-2xl p-3 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex items-start justify-between gap-2">
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-5 opacity-90 transition-transform motion-safe:group-hover:scale-110",
                      tool.color
                    )}
                  />
                  {proOnly ? (
                    <Badge variant="secondary" aria-hidden>
                      Pro
                    </Badge>
                  ) : null}
                </span>
                <span className="line-clamp-2 font-display text-xs font-medium leading-tight tracking-tight text-foreground">
                  {tool.label}
                </span>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
