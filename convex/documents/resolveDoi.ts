import { v } from "convex/values";
import { action } from "../_generated/server";
import { DoiResolverService } from "../_services/extraction/DoiResolverService";
import { getAuthUserId } from "../auth";

export const resolveDoi = action({
  args: { doi: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const service = new DoiResolverService();
    return await service.resolve(args.doi);
  },
});
