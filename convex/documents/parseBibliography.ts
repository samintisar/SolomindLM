import { action } from "../_generated/server";
import { v } from "convex/values";
import { BibliographyParserService } from "../_services/extraction/BibliographyParserService";

export const parseBibliography = action({
  args: {
    content: v.string(),
    format: v.optional(v.union(v.literal("auto"), v.literal("bibtex"), v.literal("ris"))),
  },
  handler: async (_ctx, args) => {
    const service = new BibliographyParserService();
    return service.parse(args.content, args.format ?? "auto");
  },
});
