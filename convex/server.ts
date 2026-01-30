import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Example query - you can remove this
export const hello = query({
  args: { name: v.string() },
  handler: (_, args) => {
    return `Hello ${args.name}!`;
  },
});
