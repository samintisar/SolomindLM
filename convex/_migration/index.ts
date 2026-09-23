/**
 * Migration helper functions
 */

import { internalQuery } from "../_generated/server";
import { EMBEDDING_MODEL } from "../_lib/embeddingConfig";

/**
 * Query to check migration status by comparing embeddingModel provenance.
 *
 * Filtering on `embeddingModel` (not vector length) is deliberate: two
 * different embedding models can coincidentally produce vectors of the same
 * length, so length alone can't reliably tell "already migrated" from "not
 * yet migrated." Provenance can. See reembedBatchesWorker.ts for the same
 * pattern.
 */
export const getMigrationStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("documentChunks").collect();

    const migratedCount = chunks.filter((c) => c.embeddingModel === EMBEDDING_MODEL).length;
    const notMigratedCount = chunks.length - migratedCount;

    return {
      total: chunks.length,
      migratedCount,
      notMigratedCount,
      migrationComplete: migratedCount === chunks.length,
    };
  },
});
