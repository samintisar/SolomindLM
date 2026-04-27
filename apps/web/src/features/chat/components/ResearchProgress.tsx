import React from "react";
import { Loader2, BookOpen, Globe, Sparkles, PenTool } from "lucide-react";

const PHASE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  planning: { label: "Planning research...", icon: Sparkles },
  retrieving_notebook: { label: "Searching notebook sources...", icon: BookOpen },
  retrieving_web: { label: "Searching the web...", icon: Globe },
  synthesizing: { label: "Synthesizing findings...", icon: Sparkles },
  gap_analysis: { label: "Analyzing evidence gaps...", icon: Sparkles },
  writing: { label: "Writing research report...", icon: PenTool },
};

interface ResearchProgressProps {
  phase: string;
  subQuestionId?: string;
  sourcesFound?: number;
  iteration?: number;
}

export const ResearchProgress: React.FC<ResearchProgressProps> = ({
  phase,
  sourcesFound,
  iteration,
}) => {
  const config = PHASE_CONFIG[phase] ?? { label: phase, icon: Loader2 };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 rounded-lg text-sm">
      <Icon className="w-4 h-4 text-primary animate-pulse" />
      <span className="text-foreground font-medium">{config.label}</span>
      {sourcesFound !== undefined && (
        <span className="text-muted-foreground text-xs">
          {sourcesFound} sources found
        </span>
      )}
      {iteration !== undefined && iteration > 0 && (
        <span className="text-muted-foreground text-xs">
          Pass {iteration + 1}
        </span>
      )}
    </div>
  );
};
