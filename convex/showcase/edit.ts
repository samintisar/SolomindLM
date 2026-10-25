/**
 * Hand corrections to the owner's showcase Studio items, for errors a review finds in generated
 * content (a wrong answer key, a misstated fact). Each call applies small, targeted edit ops, so
 * the arguments stay small even when the item is large. Owner's items only.
 */
import { v } from "convex/values";
import { internalMutation } from "../functions";
import { ownerByEmail } from "./db";
import { STUDIO_TABLES } from "./transfer";

export type EditPath = Array<string | number>;

export type EditOp =
  | { path: EditPath; set: unknown }
  /** Replaces every occurrence of `find` in the string at `path`; throws if there is none. */
  | { path: EditPath; find: string; replace: string };

/** Top-level fields edits may not touch. */
const PROTECTED_FIELDS = new Set(["_id", "_creationTime", "userId", "notebookId", "status"]);

function isContainer(value: unknown): value is Record<string | number, unknown> {
  return typeof value === "object" && value !== null;
}

/** Applies `ops` to a deep copy of `doc` and returns the changed top-level fields. */
export function applyEditOps(doc: Record<string, unknown>, ops: EditOp[]): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const op of ops) {
    const [field, ...rest] = op.path;
    if (typeof field !== "string" || PROTECTED_FIELDS.has(field)) {
      throw new Error(`Can't edit field ${String(field)}`);
    }
    if (!(field in changed)) changed[field] = structuredClone(doc[field]);

    if (rest.length === 0) {
      changed[field] = applyLeaf(changed[field], op, op.path);
      continue;
    }
    let parent = changed[field];
    for (const key of rest.slice(0, -1)) {
      if (!isContainer(parent)) throw new Error(`No ${op.path.join(".")}`);
      parent = parent[key];
    }
    const last = rest[rest.length - 1];
    if (!isContainer(parent) || (!("set" in op) && !(last in parent))) {
      throw new Error(`No ${op.path.join(".")}`);
    }
    parent[last] = applyLeaf(parent[last], op, op.path);
  }
  return changed;
}

function applyLeaf(current: unknown, op: EditOp, path: EditPath): unknown {
  if ("set" in op) return op.set;
  if (typeof current !== "string") throw new Error(`${path.join(".")} is not text`);
  if (!current.includes(op.find)) {
    throw new Error(`"${op.find.slice(0, 80)}" not found at ${path.join(".")}`);
  }
  return current.split(op.find).join(op.replace);
}

const pathValidator = v.array(v.union(v.string(), v.number()));

export const editShowcaseItem = internalMutation({
  args: {
    ownerEmail: v.string(),
    table: v.union(...STUDIO_TABLES.map((t) => v.literal(t))),
    id: v.string(),
    ops: v.array(
      v.union(
        v.object({ path: pathValidator, set: v.any() }),
        v.object({ path: pathValidator, find: v.string(), replace: v.string() })
      )
    ),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const id = ctx.db.normalizeId(args.table, args.id);
    const doc = id ? await ctx.db.get(id) : null;
    if (!id || !doc || doc.userId !== owner._id) {
      throw new Error(`Not one of the owner's ${args.table}`);
    }
    const changed = applyEditOps(doc as unknown as Record<string, unknown>, args.ops as EditOp[]);
    await ctx.db.patch(id, { ...changed, updatedAt: Date.now() } as never);
    return Object.keys(changed);
  },
});
