"use node";
/**
 * Wiki lint — detects broken links, orphaned articles, and stale articles.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

// ============================================================
// LINT ACTION
// ============================================================

interface LintIssue {
  type: "broken_link" | "orphan" | "stale";
  articlePath: string;
  link?: string;
  sourceId?: string;
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

export const lintWiki = internalAction({
  args: {
    wikiId: v.id("wikis"),
  },
  handler: async (ctx: any, args: any) => {
    const { wikiId } = args;

    const articles = await ctx.runQuery(
      internal.studio.wiki.index.getArticlesInternal,
      { wikiId }
    );

    if (articles.length === 0) {
      return { issueCount: 0, issues: [] };
    }

    const issues: LintIssue[] = [];

    // Build set of existing paths
    const existingPaths = new Set(articles.map((a: any) => a.path));
    // Also map by title for fuzzy matching
    const titleToPath = new Map(
      articles.map((a: any) => [a.title.toLowerCase().trim(), a.path])
    );

    // 1. Broken [[wikilinks]] — referenced article doesn't exist
    for (const article of articles) {
      if (article.type === "log" || article.type === "index") continue;
      const links = extractWikilinks(article.content);
      for (const link of links) {
        const normalized = link.startsWith("concepts/") ? link : `concepts/${slugify(link)}`;
        const titleMatch = titleToPath.get(link.toLowerCase().trim());
        if (!existingPaths.has(normalized) && !titleMatch) {
          issues.push({ type: "broken_link", articlePath: article.path, link });
        }
      }
    }

    // 2. Orphaned articles — no other article links to them
    const linkedPaths = new Set<string>();
    for (const article of articles) {
      for (const link of extractWikilinks(article.content)) {
        linkedPaths.add(link);
        linkedPaths.add(`concepts/${slugify(link)}`);
      }
    }
    for (const article of articles) {
      if (article.type !== "concept" && article.type !== "connection") continue;
      if (
        !linkedPaths.has(article.path) &&
        !linkedPaths.has(article.title) &&
        article.path !== "index"
      ) {
        issues.push({ type: "orphan", articlePath: article.path });
      }
    }

    // 3. Stale articles — source document updated after article last compiled
    for (const article of articles) {
      if (article.type !== "concept" && article.type !== "connection") continue;
      const articleUpdated = article.updatedAt || article.createdAt || 0;
      const sourceIds: string[] = article.frontmatter?.sources || article.sources || [];
      for (const sourceId of sourceIds) {
        try {
          const doc = await ctx.runQuery(internal.documents.index.getDocumentTimestamps, {
            documentId: sourceId,
          });
          if (doc && (doc.updatedAt || doc._creationTime) > articleUpdated) {
            issues.push({ type: "stale", articlePath: article.path, sourceId });
            break;
          }
        } catch {
          // Document may have been deleted; skip
        }
      }
    }

    // Store lint report as a special article
    const lintLines = [
      "# Lint Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Total issues: ${issues.length}`,
      "",
    ];

    const broken = issues.filter((i) => i.type === "broken_link");
    const orphans = issues.filter((i) => i.type === "orphan");
    const stale = issues.filter((i) => i.type === "stale");

    if (broken.length > 0) {
      lintLines.push(`## Broken Links (${broken.length})`);
      for (const b of broken) {
        lintLines.push(`- \`${b.articlePath}\` references missing \`${b.link}\``);
      }
      lintLines.push("");
    }

    if (orphans.length > 0) {
      lintLines.push(`## Orphaned Articles (${orphans.length})`);
      for (const o of orphans) {
        lintLines.push(`- \`${o.articlePath}\` — no inbound links`);
      }
      lintLines.push("");
    }

    if (stale.length > 0) {
      lintLines.push(`## Stale Articles (${stale.length})`);
      for (const s of stale) {
        lintLines.push(`- \`${s.articlePath}\` — source ${s.sourceId} updated after article`);
      }
      lintLines.push("");
    }

    if (issues.length === 0) {
      lintLines.push("No issues found. Wiki is healthy.");
    }

    const lintContent = lintLines.join("\n");

    // Upsert lint report article
    const existingLint = articles.find((a: any) => a.path === "meta/lint-report");
    if (existingLint) {
      await ctx.runMutation(internal.studio.wiki.index.updateArticleInternal, {
        articleId: existingLint._id,
        content: lintContent,
        frontmatter: {
          slug: "lint-report",
          summary: `Lint report: ${issues.length} issues`,
          sources: [],
          relatedConcepts: [],
          lastUpdated: new Date().toISOString(),
        },
        wordCount: lintContent.split(/\s+/).length,
      });
    } else {
      await ctx.runMutation(internal.studio.wiki.index.createArticleInternal, {
        wikiId,
        path: "meta/lint-report",
        type: "log",
        title: "Lint Report",
        content: lintContent,
        sources: [],
        frontmatter: {
          slug: "lint-report",
          summary: `Lint report: ${issues.length} issues`,
          sources: [],
          relatedConcepts: [],
          lastUpdated: new Date().toISOString(),
        },
        wordCount: lintContent.split(/\s+/).length,
      });
    }

    return { issueCount: issues.length, issues };
  },
});
