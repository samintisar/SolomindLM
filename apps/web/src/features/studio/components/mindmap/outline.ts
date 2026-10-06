/** Pure helpers for the mind map outline: tree cleaning, branch colours, Markdown copy and chat prompts. */

export interface OutlineNode {
  id: string;
  topic: string;
  children: OutlineNode[];
}

/** Five branch colours, cycled across the main branches (tokens in index.css). */
export const BRANCH_COLOR_COUNT = 5;

/** The CSS variable for main branch `index` (0-based), e.g. "var(--mindmap-branch-1)". */
export function branchColorVar(index: number): string {
  return `var(--mindmap-branch-${(index % BRANCH_COLOR_COUNT) + 1})`;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A non-blank string topic as is, a finite number as its text, anything else null. */
function readTopic(value: unknown): string | null {
  if (isNonBlankString(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Every real (non-blank string) id in the raw tree, so generated ids can steer clear of them. */
function collectRawIds(node: unknown, into: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const raw = node as Record<string, unknown>;
  if (isNonBlankString(raw.id)) into.add(raw.id);
  if (Array.isArray(raw.children)) {
    for (const child of raw.children) collectRawIds(child, into);
  }
}

/**
 * Fills in missing ids and topics, recursively, and keeps only `id`, `topic` and `children`.
 * Ids that are missing, blank or repeated anywhere in the tree get a fresh unique one. Generated ids
 * come from a counter, so the same input always gives the same output.
 */
export function sanitizeNodeTree(
  node: unknown,
  fallbackTopic: string,
  isRoot = false
): OutlineNode {
  const reserved = new Set<string>();
  collectRawIds(node, reserved);
  const seen = new Set<string>();
  let counter = 0;

  function freshId(): string {
    let id: string;
    do {
      counter += 1;
      id = `node-${counter}`;
    } while (reserved.has(id) || seen.has(id));
    return id;
  }

  function claimId(candidate: unknown, root: boolean): string {
    const wanted = isNonBlankString(candidate) ? candidate : root ? "root" : null;
    const id = wanted !== null && !seen.has(wanted) ? wanted : freshId();
    seen.add(id);
    return id;
  }

  function visit(current: unknown, root: boolean): OutlineNode {
    if (!current || typeof current !== "object") {
      return {
        id: claimId(null, root),
        topic: root ? fallbackTopic : "Untitled",
        children: [],
      };
    }

    const raw = current as Record<string, unknown>;
    const topic = readTopic(raw.topic) ?? (root ? fallbackTopic : "Untitled");
    // Claim this node's id before its children's, so the first occurrence of a repeated id keeps it.
    const id = claimId(raw.id, root);
    const children = Array.isArray(raw.children)
      ? raw.children.map((child: unknown) => visit(child, false))
      : [];

    return { id, topic, children };
  }

  return visit(node, isRoot);
}

/** Line breaks inside a topic or title become one space, so a multi-line topic stays one bullet. */
function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

function bulletLines(nodes: OutlineNode[], depth: number): string[] {
  return nodes.flatMap((child) => [
    `${"  ".repeat(depth)}- ${oneLine(child.topic)}`,
    ...bulletLines(child.children, depth + 1),
  ]);
}

/** `# {title}` then the whole tree (open or not) as nested "- " bullets, two spaces per level. */
export function toMarkdown(title: string, root: OutlineNode): string {
  const bullets = bulletLines(root.children, 0);
  return bullets.length === 0
    ? `# ${oneLine(title)}`
    : [`# ${oneLine(title)}`, "", ...bullets].join("\n");
}

/** "Discuss what these sources say about {topic}, in the context of {context}." */
export function askPrompt(topic: string, context: string): string {
  return `Discuss what these sources say about ${topic.trim()}, in the context of ${context.trim()}.`;
}

/** Ids of every node that has children: what Expand all opens. */
export function collectBranchIds(root: OutlineNode): string[] {
  if (root.children.length === 0) return [];
  return [root.id, ...root.children.flatMap(collectBranchIds)];
}
