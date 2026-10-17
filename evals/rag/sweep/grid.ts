/**
 * Sweep grid: `--grid "key=v1,v2;key2=v3"` parsed into axes, expanded to the cells to run.
 * Values use the same parsing as `--chat-config`, so a grid value means what it means there.
 */

import { createHash } from "crypto";
import {
  CHAT_CONFIG_OVERRIDE_KEYS,
  type ChatConfigOverrideKey,
  type ChatConfigOverrides,
  validateChatConfigOverrides,
} from "../../../convex/_agents/chat/chatConfigOverrides";
import { parseChatConfigValue } from "../chatConfigFlag";

export interface GridAxis {
  key: ChatConfigOverrideKey;
  values: Array<ChatConfigOverrides[ChatConfigOverrideKey]>;
}

export interface SweepCell {
  /** Short hash of the sorted overrides: names the cell's artifact directory */
  id: string;
  overrides: ChatConfigOverrides;
}

function isOverrideKey(key: string): key is ChatConfigOverrideKey {
  return (CHAT_CONFIG_OVERRIDE_KEYS as readonly string[]).includes(key);
}

/** Parses `key=v1,v2;key2=v3`. An empty spec has no axes. Throws on any bad key or value. */
export function parseGrid(spec: string): GridAxis[] {
  const axes: GridAxis[] = [];
  const seen = new Set<string>();
  for (const part of spec.split(";")) {
    const text = part.trim();
    if (text === "") continue;
    const eq = text.indexOf("=");
    const key = text.slice(0, eq).trim();
    if (eq < 0 || key === "") throw new Error(`--grid takes key=v1,v2 axes, got "${text}".`);
    if (!isOverrideKey(key)) {
      throw new Error(
        `Unknown --grid key "${key}". Allowed: ${CHAT_CONFIG_OVERRIDE_KEYS.join(", ")}`
      );
    }
    if (seen.has(key)) throw new Error(`--grid sets "${key}" on two axes.`);
    seen.add(key);
    const values = text
      .slice(eq + 1)
      .split(",")
      .map((raw) => parseChatConfigValue(key, raw.trim()));
    for (const value of values) {
      const problems = validateChatConfigOverrides({ [key]: value });
      if (problems.length > 0) throw new Error(`--grid: ${problems.join("; ")}`);
    }
    axes.push({ key, values });
  }
  return axes;
}

/** Every combination of one value per axis. With no axes, the single empty set. */
export function cartesian(axes: GridAxis[]): ChatConfigOverrides[] {
  let cells: ChatConfigOverrides[] = [{}];
  for (const axis of axes) {
    cells = cells.flatMap((partial) =>
      axis.values.map((value) => Object.assign({}, partial, { [axis.key]: value }))
    );
  }
  return cells;
}

/** Stable id for an override set: a short hash of its defined keys in sorted order. */
export function cellId(overrides: ChatConfigOverrides): string {
  const sorted = Object.entries(overrides)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 8);
}

/** The cells to run: the empty override set first (the baseline), then the grid product. */
export function buildSweepCells(axes: GridAxis[]): SweepCell[] {
  const seen = new Set<string>();
  const cells: SweepCell[] = [];
  for (const overrides of [{}, ...cartesian(axes)]) {
    const id = cellId(overrides);
    if (seen.has(id)) continue;
    seen.add(id);
    cells.push({ id, overrides });
  }
  return cells;
}
