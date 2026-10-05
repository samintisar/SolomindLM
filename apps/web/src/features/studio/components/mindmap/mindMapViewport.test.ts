import { describe, expect, it } from "vitest";
import {
  COLLAPSE_ABOVE_NODES,
  collapseLargeTree,
  countNodes,
  fitScale,
  MIN_READABLE_SCALE,
  type MindNode,
  openingScale,
  SCALE_MAX,
  SCALE_MIN,
  sanitizeNodeTree,
  stepScale,
} from "./mindMapViewport";

function node(id: string, children: MindNode[] = []): MindNode {
  return { id, topic: id, children };
}

/** Root with `branches` children, each holding `leaves` leaf children. */
function tree(branches: number, leaves: number): MindNode {
  return node(
    "root",
    Array.from({ length: branches }, (_, b) =>
      node(
        `b${b}`,
        Array.from({ length: leaves }, (_, l) => node(`b${b}-l${l}`))
      )
    )
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe("countNodes", () => {
  it("counts the root alone", () => {
    expect(countNodes(node("root"))).toBe(1);
  });

  it("counts every node, the root included", () => {
    expect(countNodes(tree(3, 2))).toBe(1 + 3 + 6);
  });
});

describe("collapseLargeTree", () => {
  it("returns the same reference at the threshold", () => {
    // 1 root + 13 branches * (1 + 2 leaves) = 40 nodes
    const root = tree(13, 2);
    expect(countNodes(root)).toBe(COLLAPSE_ABOVE_NODES);
    expect(collapseLargeTree(root)).toBe(root);
  });

  it("collapses root children that have children once above the threshold", () => {
    const root = tree(14, 2); // 43 nodes
    root.children.push(node("leaf-branch"));
    const result = collapseLargeTree(root);

    expect(result).not.toBe(root);
    for (const child of result.children.slice(0, 14)) {
      expect(child.expanded).toBe(false);
    }
    const leafChild = result.children.at(-1);
    expect(leafChild?.id).toBe("leaf-branch");
    expect(leafChild?.expanded).toBeUndefined();
  });

  it("leaves grandchildren untouched", () => {
    const result = collapseLargeTree(tree(14, 2));
    for (const child of result.children) {
      for (const grandchild of child.children) {
        expect(grandchild.expanded).toBeUndefined();
      }
    }
    expect(result.expanded).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const root = deepFreeze(tree(14, 2));
    expect(() => collapseLargeTree(root)).not.toThrow();
    expect(root.children[0].expanded).toBeUndefined();
  });
});

describe("openingScale", () => {
  it("never opens below the readable floor", () => {
    expect(openingScale(0.03)).toBe(MIN_READABLE_SCALE);
  });

  it("keeps a fitted zoom already in range", () => {
    expect(openingScale(0.8)).toBe(0.8);
  });

  it("never opens above 1", () => {
    expect(openingScale(1.5)).toBe(1);
  });
});

describe("fitScale", () => {
  it("clamps to the zoom-out floor", () => {
    expect(fitScale(0.03)).toBe(SCALE_MIN);
  });

  it("clamps to 1", () => {
    expect(fitScale(3)).toBe(1);
  });

  it("keeps an in-range value", () => {
    expect(fitScale(0.5)).toBe(0.5);
  });
});

describe("a fit measured in a container with no size", () => {
  it("opens and fits at 1 instead of NaN or Infinity", () => {
    for (const fitted of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(openingScale(fitted)).toBe(1);
      expect(fitScale(fitted)).toBe(1);
    }
  });
});

describe("stepScale", () => {
  it("zooms in by 1.25", () => {
    expect(stepScale(1, "in")).toBe(1.25);
  });

  it("zooms out by 1.25", () => {
    expect(stepScale(1, "out")).toBe(0.8);
  });

  it("rounds to two decimals", () => {
    expect(stepScale(0.7, "in")).toBe(0.88);
  });

  it("clamps at the maximum", () => {
    expect(stepScale(1.9, "in")).toBe(SCALE_MAX);
    expect(stepScale(SCALE_MAX, "in")).toBe(SCALE_MAX);
  });

  it("clamps at the minimum", () => {
    expect(stepScale(0.21, "out")).toBe(SCALE_MIN);
    expect(stepScale(SCALE_MIN, "out")).toBe(SCALE_MIN);
  });
});

describe("sanitizeNodeTree", () => {
  it("turns a non-object root into the fallback topic with id root", () => {
    expect(sanitizeNodeTree(null, "Fallback", true)).toEqual({
      id: "root",
      topic: "Fallback",
      children: [],
    });
  });

  it("gives a non-object child an Untitled topic and a generated id", () => {
    const result = sanitizeNodeTree("nope", "Fallback");
    expect(result.topic).toBe("Untitled");
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.children).toEqual([]);
  });

  it("replaces blank topics", () => {
    const result = sanitizeNodeTree(
      { id: "root", topic: "  ", children: [{ id: "a", topic: "" }] },
      "Fallback",
      true
    );
    expect(result.topic).toBe("Fallback");
    expect(result.children[0].topic).toBe("Untitled");
  });

  it("fills in missing ids", () => {
    const result = sanitizeNodeTree({ topic: "T", children: [{ topic: "C" }] }, "F", true);
    expect(result.id).toBe("root");
    expect(result.children[0].id.length).toBeGreaterThan(0);
  });

  it("recurses into children and keeps extra fields", () => {
    const result = sanitizeNodeTree(
      {
        id: "root",
        topic: "R",
        children: [{ id: "a", topic: "A", children: [{ topic: "" }] }],
        note: "x",
      },
      "F",
      true
    );
    expect(result.note).toBe("x");
    expect(result.children[0].children[0].topic).toBe("Untitled");
  });

  it("treats a missing children array as empty", () => {
    expect(sanitizeNodeTree({ id: "r", topic: "R" }, "F", true).children).toEqual([]);
  });
});
