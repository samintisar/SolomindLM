"use node";
/**
 * Wiki model - CRUD helpers for wiki and wiki article operations.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * Create a new wiki for a notebook
 */
export async function createWiki(
  ctx: MutationCtx,
  data: {
    userId: any;
    notebookId: any;
    title: string;
    status: string;
  }
) {
  const now = Date.now();
  const wikiId = await ctx.db.insert("wikis", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: data.status,
    generatedAt: now,
    lastRefreshedAt: undefined,
    metadata: undefined,
    error: undefined,
  });
  return wikiId;
}

/**
 * Get a wiki by ID
 */
export async function getWiki(ctx: QueryCtx, wikiId: any): Promise<Doc<"wikis"> | null> {
  return await ctx.db.get("wikis", wikiId);
}

/**
 * Get wiki by notebook ID
 */
export async function getWikiByNotebook(
  ctx: QueryCtx,
  notebookId: any
): Promise<Doc<"wikis"> | null> {
  const wikis = await ctx.db
    .query("wikis")
    .withIndex("by_notebook", (q: any) => q.eq("notebookId", notebookId))
    .collect();

  return wikis[0] || null;
}

/**
 * Update wiki status
 */
export async function updateWikiStatus(
  ctx: MutationCtx,
  wikiId: any,
  status: string,
  error?: string
) {
  const patch: Record<string, unknown> = { status };
  if (error !== undefined) {
    patch.error = error;
  } else if (status === "completed") {
    patch.error = undefined;
  }
  await ctx.db.patch(wikiId, patch);
}

/**
 * Update wiki metadata
 */
export async function updateWikiMetadata(ctx: MutationCtx, wikiId: any, metadata: any) {
  await ctx.db.patch(wikiId, {
    metadata,
    lastRefreshedAt: Date.now(),
  });
}

/**
 * Create a wiki article
 */
export async function createWikiArticle(
  ctx: MutationCtx,
  data: {
    wikiId: any;
    path: string;
    type: "concept" | "connection" | "qa" | "index" | "log";
    title: string;
    content: string;
    sources: any[];
    frontmatter?: any;
    wordCount?: number;
  }
) {
  const now = Date.now();
  const articleId = await ctx.db.insert("wikiArticles", {
    wikiId: data.wikiId,
    path: data.path,
    type: data.type,
    title: data.title,
    content: data.content,
    sources: data.sources,
    frontmatter: data.frontmatter,
    wordCount: data.wordCount,
    createdAt: now,
    updatedAt: now,
  });
  return articleId;
}

/**
 * Get articles by wiki ID
 */
export async function getWikiArticles(ctx: QueryCtx, wikiId: any): Promise<Doc<"wikiArticles">[]> {
  return await ctx.db
    .query("wikiArticles")
    .withIndex("by_wiki", (q: any) => q.eq("wikiId", wikiId))
    .collect();
}

/**
 * Get article by path
 */
export async function getWikiArticleByPath(
  ctx: QueryCtx,
  wikiId: any,
  path: string
): Promise<Doc<"wikiArticles"> | null> {
  const articles = await ctx.db
    .query("wikiArticles")
    .withIndex("by_path", (q: any) => q.eq("wikiId", wikiId).eq("path", path))
    .collect();

  return articles[0] || null;
}

/**
 * Update wiki article
 */
export async function updateWikiArticle(
  ctx: MutationCtx,
  articleId: any,
  updates: {
    content?: string;
    frontmatter?: any;
    wordCount?: number;
  }
) {
  await ctx.db.patch(articleId, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Delete all articles for a wiki
 */
export async function deleteWikiArticles(ctx: MutationCtx, wikiId: any) {
  const articles = await getWikiArticles(ctx, wikiId);

  for (const article of articles) {
    await ctx.db.delete(article._id);
  }
}

/**
 * Delete a wiki and all its articles
 */
export async function deleteWiki(ctx: MutationCtx, wikiId: any) {
  // Delete all articles first
  await deleteWikiArticles(ctx, wikiId);

  // Delete the wiki
  await ctx.db.delete(wikiId);
}
