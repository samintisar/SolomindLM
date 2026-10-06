/** Pure viewport rules for the mind map: opening zoom, zoom steps and collapsing large maps. */

/** Opening zoom never goes below this (#171). */
export const MIN_READABLE_SCALE = 0.6;
/** Zoom-out floor for the buttons, the wheel and fit. */
export const SCALE_MIN = 0.2;
export const SCALE_MAX = 2;
/** Maps with more nodes than this open with the root's branches collapsed. */
export const COLLAPSE_ABOVE_NODES = 40;

const ZOOM_STEP = 1.25;

export interface MindNode {
  id: string;
  topic: string;
  children: MindNode[];
  expanded?: boolean;
  [key: string]: unknown;
}

function randomNodeId(): string {
  return `node-${Math.random().toString(36).slice(2, 9)}`;
}

/** Fills in missing ids and topics, recursively. */
export function sanitizeNodeTree(node: unknown, fallbackTopic: string, isRoot = false): MindNode {
  if (!node || typeof node !== "object") {
    return {
      id: isRoot ? "root" : randomNodeId(),
      topic: isRoot ? fallbackTopic : "Untitled",
      children: [],
    };
  }

  const raw = node as Record<string, unknown>;
  const rawTopic = typeof raw.topic === "string" ? raw.topic : "";
  const topic = rawTopic.trim().length > 0 ? rawTopic : isRoot ? fallbackTopic : "Untitled";
  const id =
    typeof raw.id === "string" && raw.id.trim().length > 0
      ? raw.id
      : isRoot
        ? "root"
        : randomNodeId();
  const children = Array.isArray(raw.children)
    ? raw.children.map((child: unknown) => sanitizeNodeTree(child, fallbackTopic, false))
    : [];

  return { ...raw, id, topic, children };
}

/** All nodes, the root included. */
export function countNodes(root: MindNode): number {
  return root.children.reduce((total, child) => total + countNodes(child), 1);
}

/**
 * Above COLLAPSE_ABOVE_NODES, returns a copy whose root children that have children of their own
 * are marked `expanded: false`, so the map opens showing the root and its children only.
 * Otherwise returns the input unchanged (same reference). Never mutates.
 */
export function collapseLargeTree(root: MindNode): MindNode {
  if (countNodes(root) <= COLLAPSE_ABOVE_NODES) return root;
  return {
    ...root,
    children: root.children.map((child) =>
      child.children.length > 0 ? { ...child, expanded: false } : child
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The zoom to open at: the fitted zoom, but never below MIN_READABLE_SCALE nor above 1. A container
 * with no size yet (a hidden panel) fits to Infinity or NaN; that opens at 1.
 */
export function openingScale(fitted: number): number {
  return Number.isFinite(fitted) ? clamp(fitted, MIN_READABLE_SCALE, 1) : 1;
}

/** Fit for the Fit button: the fitted zoom clamped to [SCALE_MIN, 1], or 1 when it isn't finite. */
export function fitScale(fitted: number): number {
  return Number.isFinite(fitted) ? clamp(fitted, SCALE_MIN, 1) : 1;
}

/** One zoom step: x1.25 in, /1.25 out, clamped to [SCALE_MIN, SCALE_MAX], rounded to 2 decimals. */
export function stepScale(current: number, direction: "in" | "out"): number {
  const next = direction === "in" ? current * ZOOM_STEP : current / ZOOM_STEP;
  return Math.round(clamp(next, SCALE_MIN, SCALE_MAX) * 100) / 100;
}
