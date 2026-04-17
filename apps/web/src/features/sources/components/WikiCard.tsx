import React, { useState, useMemo } from "react";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Folder,
  RefreshCw,
  FileText,
  Loader2,
  Square,
} from "lucide-react";
import type { Wiki } from "../services/wikiApi";

interface WikiCardProps {
  wiki: Wiki | null | undefined;
  isPending?: boolean;
  onCreateWiki: () => void;
  onRegenerateWiki?: () => void;
  onCancelGeneration?: () => void;
  /** Open a wiki article in the sources panel viewer (path from API, e.g. concepts/foo). */
  onOpenArticle?: (path: string) => void;
}

interface WikiPage {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WikiPage[];
}

const WikiTreeItem: React.FC<{
  page: WikiPage;
  level: number;
  onOpenArticle?: (path: string) => void;
}> = ({ page, level, onOpenArticle }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFolder = page.type === "folder";

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) {
            setIsExpanded(!isExpanded);
          } else {
            onOpenArticle?.(page.path);
          }
        }}
        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded hover:bg-secondary/50 transition-colors text-left ${
          level > 0 ? "ml-4" : ""
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <Folder
              className={`w-4 h-4 ${isExpanded ? "text-primary" : "text-muted-foreground"}`}
            />
          </>
        ) : (
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm text-foreground truncate">{page.name}</span>
      </button>
      {isFolder && isExpanded && page.children && (
        <div className="mt-0.5">
          {page.children.map((child) => (
            <WikiTreeItem
              key={child.id}
              page={child}
              level={level + 1}
              onOpenArticle={onOpenArticle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const WikiCard: React.FC<WikiCardProps> = ({
  wiki,
  isPending,
  onCreateWiki,
  onRegenerateWiki,
  onCancelGeneration,
  onOpenArticle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Build wiki structure from articles
  const wikiStructure = useMemo(() => {
    if (!wiki?.articles || wiki.articles.length === 0) {
      return [];
    }

    // Group articles by type and path
    const grouped: Record<string, WikiPage[]> = {};

    wiki.articles.forEach((article) => {
      if (article.type === "index" || article.type === "log") {
        // Root level files
        if (!grouped.root) grouped.root = [];
        grouped.root.push({
          id: article.path,
          name: article.title,
          path: article.path,
          type: "file",
        });
      } else if (article.type === "concept") {
        // Concepts folder
        if (!grouped.concepts) grouped.concepts = [];
        grouped.concepts.push({
          id: article.path,
          name: article.title,
          path: article.path,
          type: "file",
        });
      } else if (article.type === "connection") {
        // Connections folder
        if (!grouped.connections) grouped.connections = [];
        grouped.connections.push({
          id: article.path,
          name: article.title,
          path: article.path,
          type: "file",
        });
      } else if (article.type === "qa") {
        // QA folder
        if (!grouped.qa) grouped.qa = [];
        grouped.qa.push({
          id: article.path,
          name: article.title,
          path: article.path,
          type: "file",
        });
      }
    });

    // Build tree structure
    const tree: WikiPage[] = [];

    // Add concepts folder
    if (grouped.concepts && grouped.concepts.length > 0) {
      tree.push({
        id: "concepts",
        name: "Concepts",
        path: "concepts",
        type: "folder",
        children: grouped.concepts,
      });
    }

    // Add connections folder
    if (grouped.connections && grouped.connections.length > 0) {
      tree.push({
        id: "connections",
        name: "Connections",
        path: "connections",
        type: "folder",
        children: grouped.connections,
      });
    }

    // Add QA folder
    if (grouped.qa && grouped.qa.length > 0) {
      tree.push({
        id: "qa",
        name: "QA",
        path: "qa",
        type: "folder",
        children: grouped.qa,
      });
    }

    // Add root level files (index, log, etc.)
    if (grouped.root) {
      tree.push(...grouped.root);
    }

    return tree;
  }, [wiki?.articles]);

  if (!wiki) {
    return (
      <button
        onClick={onCreateWiki}
        className="w-full group flex flex-col bg-card/50 border border-dashed border-border/50 rounded-lg hover:bg-card hover:border-border hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3 py-4 px-3">
          <div className="text-muted-foreground group-hover:text-primary transition-colors shrink-0 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-medium text-foreground truncate leading-tight">
              Create Knowledge Wiki
            </h4>
            <p className="text-sm text-muted-foreground uppercase tracking-wide font-sans">
              Map out all your sources
            </p>
          </div>
        </div>
      </button>
    );
  }

  const wikiStatus = wiki.status;
  const isDraft = wikiStatus === "draft";
  const isGenerating = wikiStatus === "generating" || Boolean(isPending);
  const isCompleted = wikiStatus === "completed";
  const isFailed = wikiStatus === "failed";

  const showRefresh =
    Boolean(onRegenerateWiki) && !isGenerating && (isDraft || isCompleted || isFailed);
  const showStop = Boolean(onCancelGeneration) && isGenerating;

  const cardClass =
    "bg-card border rounded-lg transition-colors" +
    (isGenerating ? " border-primary/50 bg-primary/[0.06] shadow-sm" : " border-border");

  return (
    <div className={cardClass} aria-busy={isGenerating}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="w-full group flex items-center gap-3 py-4 px-3 min-h-13 hover:bg-secondary/30 transition-colors cursor-pointer"
      >
        <div className="text-primary shrink-0 flex items-center justify-center">
          {isGenerating ? (
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
          ) : (
            <BookOpen className="w-6 h-6" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-medium text-foreground truncate leading-tight">
            {wiki.title || "Knowledge Wiki"}
          </h4>
          {isGenerating && (
            <p className="text-sm text-primary font-medium uppercase tracking-wide font-sans">
              Building your wiki…
            </p>
          )}
          {!isGenerating && isFailed && (
            <p className="text-sm text-muted-foreground uppercase tracking-wide font-sans">
              Generation failed
            </p>
          )}
          {!isGenerating && isDraft && (
            <p className="text-sm text-muted-foreground uppercase tracking-wide font-sans">
              Not generated yet
            </p>
          )}
          {!isGenerating && isCompleted && wiki.metadata?.articleCounts && (
            <p className="text-sm text-muted-foreground uppercase tracking-wide font-sans">
              {wiki.metadata.articleCounts.total} articles
            </p>
          )}
          {!isGenerating && isCompleted && !wiki.metadata?.articleCounts && (
            <p className="text-sm text-muted-foreground uppercase tracking-wide font-sans">
              Up to date
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showStop && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelGeneration?.();
              }}
              className="p-1.5 hover:bg-destructive/15 rounded-lg transition-colors text-muted-foreground hover:text-destructive"
              title="Stop generation"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          )}
          {showRefresh && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateWiki?.();
              }}
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              title={isDraft ? "Generate knowledge base" : "Regenerate knowledge base"}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground" aria-hidden />
          )}
        </div>
      </div>

      {isGenerating && (
        <div className="px-3 pb-3 space-y-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full w-1/2 rounded-full bg-primary/80 animate-pulse motion-reduce:animate-none"
              style={{ animationDuration: "1.2s" }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground leading-snug">
            Compiling articles from your sources. This can take a minute.
          </p>
        </div>
      )}

      {!isGenerating && isFailed && wiki.error && (
        <div className="px-3 pb-2">
          <p className="text-xs text-destructive/90 leading-snug line-clamp-3">{wiki.error}</p>
        </div>
      )}

      {isExpanded && (
        <div className="px-3 pb-3">
          {wikiStructure.length > 0 ? (
            <div className="pt-2 border-t border-border/50">
              {wikiStructure.map((page) => (
                <WikiTreeItem key={page.id} page={page} level={0} onOpenArticle={onOpenArticle} />
              ))}
            </div>
          ) : (
            <div className="pt-4 pb-2 text-center text-sm text-muted-foreground">
              {isGenerating ? "Generating wiki articles…" : "No articles generated yet"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
