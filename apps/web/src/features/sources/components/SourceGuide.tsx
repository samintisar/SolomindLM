import React, { useState } from "react";
import { Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { useSourceGuide } from "../hooks/useSourceGuide";

interface SourceGuideProps {
  documentId: string;
  onTopicClick: (topic: string) => void;
}

export const SourceGuide: React.FC<SourceGuideProps> = ({ documentId, onTopicClick }) => {
  const { summary, topics, isLoading } = useSourceGuide(documentId);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isLoading && !summary && !topics) {
    return null;
  }

  return (
    <div className="bg-muted/30 rounded-xl border border-border/40 p-4 mb-4">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">Source guide</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <>
              <div className="space-y-2">
                <div className="h-3 bg-secondary/50 rounded w-full animate-pulse" />
                <div className="h-3 bg-secondary/50 rounded w-5/6 animate-pulse" />
                <div className="h-3 bg-secondary/50 rounded w-4/6 animate-pulse" />
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 w-24 bg-secondary/50 rounded-full animate-pulse" />
                ))}
              </div>
            </>
          ) : (
            <>
              {summary && (
                <p
                  className="text-sm text-foreground/90 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: summary
                      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
              )}
              {topics && topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic: string) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => onTopicClick(topic)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium bg-muted/80 border border-border/60 hover:bg-accent hover:border-primary/30 transition-colors cursor-pointer truncate max-w-[160px]"
                      title={topic}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
