import { ArrowRight } from "lucide-react";
import React from "react";

interface ResearchArtifactCardProps {
  icon: React.ReactNode;
  title: string;
  typeLabel: string;
  onClick?: () => void;
}

export const ResearchArtifactCard: React.FC<ResearchArtifactCardProps> = ({
  icon,
  title,
  typeLabel,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-start gap-4 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-all hover:border-border hover:bg-accent/25"
  >
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
      {icon}
    </div>
    <div className="min-w-0 flex-1 pt-0.5">
      <div className="text-[15px] font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
        {title}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{typeLabel}</div>
    </div>
    <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
  </button>
);
