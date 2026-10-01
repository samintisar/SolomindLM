import { Brain, Check, FileText, ListOrdered, PenLine, Search, Sparkles } from "lucide-react";
import React from "react";
import { Spinner } from "@/shared/components/ui/spinner";

export function getStatusIcon(status?: string): React.ReactNode {
  switch (status) {
    case "searching":
      return <Search className="w-3.5 h-3.5" />;
    case "reading":
      return <FileText className="w-3.5 h-3.5" />;
    case "planning":
      return <Brain className="w-3.5 h-3.5" />;
    case "thinking":
      return <Brain className="w-3.5 h-3.5" />;
    case "generating":
      return <Spinner className="size-3.5" />;
    case "writing":
      return <PenLine className="w-3.5 h-3.5 text-foreground/70" />;
    case "retrieving":
      return <Search className="w-3.5 h-3.5" />;
    case "embedding":
      return <Sparkles className="w-3.5 h-3.5" />;
    case "ranking":
      return <ListOrdered className="w-3.5 h-3.5" />;
    case "completed":
      return <Check className="w-3.5 h-3.5 text-success-muted-foreground" />;
    default:
      return status ? <Brain className="w-3.5 h-3.5" /> : null;
  }
}

export function getStatusMessage(status?: string): string | null {
  switch (status) {
    case "searching":
      return "Searching sources";
    case "reading":
      return "Reading sources";
    case "planning":
      return "Planning";
    case "thinking":
      return "Thinking";
    case "generating":
      return "Generating response";
    case "writing":
      return "Writing answer";
    case "retrieving":
      return "Retrieving passages";
    case "embedding":
      return "Embedding query";
    case "ranking":
      return "Ranking results";
    case "completed":
      return "Response complete";
    default:
      return status ? status.replace(/_/g, " ") : null;
  }
}
