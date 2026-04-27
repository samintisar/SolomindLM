/**
 * Migration helper functions
 */

import { internalQuery } from "../_generated/server";

/**
 * Query to check migration status by comparing embedding dimensions
 */
export const getMigrationStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("documentChunks").collect();

    const oldDimCount = chunks.filter(c => c.embedding && c.embedding.length === 1536).length;
    const newDimCount = chunks.filter(c => c.embedding && c.embedding.length === 1024).length;
    const otherDimCount = chunks.length - oldDimCount - newDimCount;

    return {
      total: chunks.length,
      oldDimensions: oldDimCount, // 1536 (OpenAI)
      newDimensions: newDimCount, // 1024 (Together AI)
      otherDimensions: otherDimCount,
      migrationComplete: newDimCount === chunks.length,
    };
  },
});
