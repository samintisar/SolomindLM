/**
 * Migration script to fix audio URLs in audioOverviews table
 *
 * This script updates audioUrl fields from relative paths (/audio/...)
 * to full Convex storage URLs (https://xxx.convex.site/_storage/...)
 */

import { internalMutation } from "../_generated/server";

export const fixAudioUrls = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all audio overviews
    const audioOverviews = await ctx.db.query("audioOverviews").collect();

    console.log(`[fixAudioUrls] Found ${audioOverviews.length} audio overviews to check`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const overview of audioOverviews) {
      const currentUrl = overview.audioUrl;

      // Check if URL needs fixing (starts with /audio/ or is relative)
      if (!currentUrl) {
        console.log(`[fixAudioUrls] Skipping ${overview._id} - no audioUrl`);
        skippedCount++;
        continue;
      }

      // If it's already a full HTTP/HTTPS URL, skip it
      if (currentUrl.startsWith("http://") || currentUrl.startsWith("https://")) {
        console.log(
          `[fixAudioUrls] Skipping ${overview._id} - already has full URL: ${currentUrl}`
        );
        skippedCount++;
        continue;
      }

      // Extract storage ID from the URL
      // Handles formats:
      // - /audio/kg26nrt5eaktrgsgekmtj2eres84gqrb
      // - kg26nrt5eaktrgsgekmtj2eres84gqrb
      let storageId = currentUrl;

      // Remove /audio/ prefix if present
      if (currentUrl.startsWith("/audio/")) {
        storageId = currentUrl.replace("/audio/", "");
      }

      // Remove leading slash if present
      if (storageId.startsWith("/")) {
        storageId = storageId.substring(1);
      }

      console.log(`[fixAudioUrls] Processing ${overview._id}:`);
      console.log(`  Current URL: ${currentUrl}`);
      console.log(`  Extracted storageId: ${storageId}`);

      // Generate the correct Convex storage URL
      const correctUrl = await ctx.storage.getUrl(storageId as any);

      if (!correctUrl) {
        console.error(`[fixAudioUrls] Failed to get URL for storageId: ${storageId}`);
        skippedCount++;
        continue;
      }

      console.log(`  Correct URL: ${correctUrl}`);

      // Update the database
      await ctx.db.patch(overview._id, {
        audioUrl: correctUrl,
      });

      fixedCount++;
      console.log(`[fixAudioUrls] ✅ Fixed ${overview._id}`);
    }

    console.log(`[fixAudioUrls] Complete! Fixed: ${fixedCount}, Skipped: ${skippedCount}`);

    return {
      total: audioOverviews.length,
      fixed: fixedCount,
      skipped: skippedCount,
    };
  },
});
