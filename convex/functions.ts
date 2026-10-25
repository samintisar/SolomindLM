/**
 * Mutation builders with database triggers. Define every mutation with these, not the ones in
 * `_generated/server` (Biome enforces it): writes made outside them skip the triggers and leave
 * denormalized tables such as `studioItems` out of date.
 */

import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";
import {
  // biome-ignore lint/style/noRestrictedImports: the trigger-wrapped builders are defined here
  internalMutation as rawInternalMutation,
  // biome-ignore lint/style/noRestrictedImports: the trigger-wrapped builders are defined here
  mutation as rawMutation,
} from "./_generated/server";
import { registerStudioItemTriggers } from "./_model/studioItems";

const triggers = new Triggers<DataModel>();
registerStudioItemTriggers(triggers);

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
