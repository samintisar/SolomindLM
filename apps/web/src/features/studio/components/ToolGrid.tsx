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

/**
 * ToolGrid component displays creation tool cards in a responsive grid.
 */
export const ToolGrid: React.FC<ToolGridProps> = ({ tools, onToolClick, activeToolId }) => {
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
          return (
            <Card key={tool.id} variant="interactive" data-selected={isActive || undefined}>
              <button
                type="button"
                aria-label={tool.label}
                onClick={() => onToolClick(tool.id)}
                className="group flex h-22 flex-col justify-between rounded-2xl p-3 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-5 opacity-90 transition-transform motion-safe:group-hover:scale-110",
                    tool.color
                  )}
                />
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
