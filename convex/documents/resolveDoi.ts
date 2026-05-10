import { action } from "../_generated/server";
import { v } from "convex/values";
import { DoiResolverService } from "../_services/extraction/DoiResolverService";

export const resolveDoi = action({
  args: { doi: v.string() },
  handler: async (_ctx, args) => {
    const service = new DoiResolverService();
    return await service.resolve(args.doi);
  },
});
