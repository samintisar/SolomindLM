import React from "react";
import {
  FileText,
  AudioLines,
  GitFork,
  Layers,
  HelpCircle,
  Presentation,
  MessageSquareText,
  Table2,
} from "lucide-react";
import { StudioTool } from "@/shared/types/index";

interface ToolGridProps {
  tools: StudioTool[];
  onToolClick: (toolId: string) => void;
  width: number;
  /** When set, that tool card shows a selection ring (e.g. marketing preview). */
  activeToolId?: string | null;
}

// Icon map for tool icons
const IconMap: Record<string, React.FC<any>> = {
  AudioLines,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  Presentation,
  MessageSquareText,
  Table2,
};

/**
 * ToolGrid component displays creation tool cards in a responsive grid.
 */
export const ToolGrid: React.FC<ToolGridProps> = ({ tools, onToolClick, width, activeToolId }) => {
  return (
    <div className="space-y-3" data-onboarding="studio-tool-grid" data-testid="studio-tool-grid">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 font-display">
        Create
      </h3>
      <div className={`grid gap-3 ${width > 450 ? "grid-cols-3" : "grid-cols-2"}`}>
        {tools.map((tool) => {
          const Icon = IconMap[tool.iconName] || FileText;
          const isActive = activeToolId != null && activeToolId === tool.id;
          return (
            <div
              key={tool.id}
              aria-label={tool.label}
              onClick={() => onToolClick(tool.id)}
              className={`group flex flex-col justify-between p-3 h-24 bg-card border border-border rounded-lg hover:shadow-md hover:border-primary/50 transition-all cursor-pointer ${
                isActive ? "ring-2 ring-primary/40 border-primary/45 shadow-md" : ""
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToolClick(tool.id);
                }
              }}
            >
              <div className="flex justify-between items-start w-full">
                <Icon
                  className={`w-5 h-5 ${tool.color} opacity-90 group-hover:scale-110 transition-transform`}
                />
              </div>
              <span className="text-sm font-medium text-foreground leading-tight font-display tracking-tight">
                {tool.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
