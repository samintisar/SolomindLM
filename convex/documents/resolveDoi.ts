import { v } from "convex/values";
import { action } from "../_generated/server";
import { toConvexError } from "../_lib/serviceErrors";
import { DoiResolverService } from "../_services/extraction/DoiResolverService";
import { getAuthUserId } from "../auth";

/** Accepts a DOI, doi.org link, arXiv ID or arxiv.org link. Null when no registry has it. */
export const resolveDoi = action({
  args: { doi: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const service = new DoiResolverService();
    try {
      return await service.resolve(args.doi);
    } catch (err) {
      // Typed errors reach the client with their message: a bad input, or a registry outage.
      throw toConvexError(err);
    }
  },
});
