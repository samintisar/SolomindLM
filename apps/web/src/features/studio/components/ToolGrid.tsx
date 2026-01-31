import React from 'react';
import {
  FileText,
  AudioLines,
  GitFork,
  Layers,
  HelpCircle,
  Presentation,
  MessageSquareText,
  Table2,
} from 'lucide-react';
import { StudioTool } from '@/shared/types/index';

interface ToolGridProps {
  tools: StudioTool[];
  onToolClick: (toolId: string) => void;
  width: number;
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
export const ToolGrid: React.FC<ToolGridProps> = ({ tools, onToolClick, width }) => {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 font-sans">
        Create
      </h3>
      <div className={`grid gap-3 ${width > 450 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {tools.map((tool) => {
          const Icon = IconMap[tool.iconName] || FileText;
          return (
            <div
              key={tool.id}
              onClick={() => onToolClick(tool.id)}
              className="group flex flex-col justify-between p-3 h-24 bg-card border border-border rounded-lg hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToolClick(tool.id);
                }
              }}
            >
              <div className="flex justify-between items-start w-full">
                <Icon className={`w-5 h-5 ${tool.color} opacity-90 group-hover:scale-110 transition-transform`} />
              </div>
              <span className="text-sm font-medium text-foreground leading-tight font-sans tracking-tight">
                {tool.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
