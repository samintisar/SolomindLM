import { v } from "convex/values";
import { action } from "../_generated/server";
import { BibliographyParserService } from "../_services/extraction/BibliographyParserService";
import { getAuthUserId } from "../auth";

export const parseBibliography = action({
  args: {
    content: v.string(),
    format: v.optional(v.union(v.literal("auto"), v.literal("bibtex"), v.literal("ris"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const service = new BibliographyParserService();
    return service.parse(args.content, args.format ?? "auto");
  },
});
