"use node";

import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { betterAuth } from "better-auth/minimal";
import { createAuthOptions } from "./betterAuth/options";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

/**
 * Better-Auth component for HTTP routes and actions.
 * This file uses "use node" and is only imported by http.ts and action files.
 * DO NOT import this from files with query/mutation functions!
 */

export const authComponent = createClient<DataModel>(
  components.betterAuth as unknown as Parameters<typeof createClient<DataModel>>[0]
);

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    ...createAuthOptions(),
    database: authComponent.adapter(ctx),
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig, options: { basePath: "/auth" } }),
    ],
  });
}
