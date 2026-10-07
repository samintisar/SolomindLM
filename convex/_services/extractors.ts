"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { WebLoaderService } from "./extraction/WebLoaderService";

export const scrapeWebPageInternal = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, args): Promise<{ title: string; content: string; url: string }> => {
    const logger = createServiceLogger("extractors", "scrapeWebPageInternal");
    logger.operationStart({ url: args.url });
    const loader = new WebLoaderService();
    const result = await loader.loadWebPageWithMeta(args.url);
    logger.operationComplete({
      url: args.url,
      title: result.title,
      contentLength: result.content.length,
    });
    return result;
  },
});

export const getSocialTranscriptInternal = internalAction({
  args: { url: v.string() },
  handler: async (_ctx, args): Promise<{ title: string; content: string; url: string }> => {
    const logger = createServiceLogger("extractors", "getSocialTranscriptInternal");
    logger.operationStart({ url: args.url });
    const loader = new WebLoaderService();
    const result = await loader.loadSocialTranscriptWithMeta(args.url);
    logger.operationComplete({
      url: args.url,
      title: result.title,
      contentLength: result.content.length,
    });
    return { ...result, url: args.url };
  },
});
