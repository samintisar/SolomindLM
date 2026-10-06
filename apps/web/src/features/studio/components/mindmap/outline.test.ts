import { describe, expect, it } from "vitest";
import {
  askPrompt,
  BRANCH_COLOR_COUNT,
  branchColorVar,
  collectBranchIds,
  type OutlineNode,
  sanitizeNodeTree,
  toMarkdown,
} from "./outline";

function node(id: string, children: OutlineNode[] = [], topic = id): OutlineNode {
  return { id, topic, children };
}

function allIds(root: OutlineNode): string[] {
  return [root.id, ...root.children.flatMap(allIds)];
}

describe("branchColorVar", () => {
  it("maps the first five branches to tokens 1 to 5", () => {
    expect(BRANCH_COLOR_COUNT).toBe(5);
    expect(branchColorVar(0)).toBe("var(--mindmap-branch-1)");
    expect(branchColorVar(4)).toBe("var(--mindmap-branch-5)");
  });

  it("wraps after the last colour", () => {
    expect(branchColorVar(5)).toBe("var(--mindmap-branch-1)");
    expect(branchColorVar(7)).toBe("var(--mindmap-branch-3)");
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

  it("turns non-object children into Untitled leaves", () => {
    const result = sanitizeNodeTree(
      { id: "root", topic: "R", children: [null, "x", 3, { id: "a", topic: "A" }] },
      "F",
      true
    );
    expect(result.children.map((c) => c.topic)).toEqual(["Untitled", "Untitled", "Untitled", "A"]);
    expect(result.children.every((c) => c.children.length === 0)).toBe(true);
    expect(new Set(allIds(result)).size).toBe(5);
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

  it("drops fields other than id, topic and children", () => {
    const result = sanitizeNodeTree(
      {
        id: "root",
        topic: "R",
        note: "x",
        expanded: false,
        children: [{ id: "a", topic: "A", style: { color: "red" }, children: [] }],
      },
      "F",
      true
    );
    expect(result).toEqual({
      id: "root",
      topic: "R",
      children: [{ id: "a", topic: "A", children: [] }],
    });
  });

  it("fills in missing ids, with root for the root", () => {
    const result = sanitizeNodeTree({ topic: "T", children: [{ topic: "C" }] }, "F", true);
    expect(result.id).toBe("root");
    expect(result.children[0].id.length).toBeGreaterThan(0);
    expect(result.children[0].id).not.toBe("root");
  });

  it("replaces blank ids", () => {
    const result = sanitizeNodeTree(
      { id: "root", topic: "R", children: [{ id: "  ", topic: "A" }] },
      "F",
      true
    );
    expect(result.children[0].id.trim().length).toBeGreaterThan(0);
  });

  it("gives children that share an id different ids", () => {
    const result = sanitizeNodeTree(
      {
        id: "root",
        topic: "R",
        children: [
          { id: "dup", topic: "A" },
          { id: "dup", topic: "B", children: [{ id: "dup", topic: "C" }] },
        ],
      },
      "F",
      true
    );
    const ids = allIds(result);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.children[0].id).toBe("dup");
  });

  it("gives a child that repeats the root id a different id", () => {
    const result = sanitizeNodeTree(
      { id: "root", topic: "R", children: [{ id: "root", topic: "A" }] },
      "F",
      true
    );
    expect(result.id).toBe("root");
    expect(result.children[0].id).not.toBe("root");
  });

  it("never gives a generated id that a real id later in the tree already uses", () => {
    // Generated ids come from a counter; real ids that look like generated ones must be safe.
    const probe = sanitizeNodeTree(
      { id: "root", topic: "R", children: [{ topic: "x" }] },
      "F",
      true
    );
    const generated = probe.children[0].id;

    const result = sanitizeNodeTree(
      {
        id: "root",
        topic: "R",
        children: [{ topic: "missing id" }, { id: generated, topic: "real id" }],
      },
      "F",
      true
    );
    expect(result.children[1].id).toBe(generated);
    expect(result.children[0].id).not.toBe(generated);
    const ids = allIds(result);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives equal output for repeated calls on the same input", () => {
    const input = {
      id: "root",
      topic: "R",
      children: [{ topic: "a" }, { id: "x", topic: "b", children: [{}, "s"] }, { id: "x" }],
    };
    expect(sanitizeNodeTree(input, "F", true)).toEqual(sanitizeNodeTree(input, "F", true));
  });

  it("recurses into children", () => {
    const result = sanitizeNodeTree(
      { id: "root", topic: "R", children: [{ id: "a", topic: "A", children: [{ topic: "" }] }] },
      "F",
      true
    );
    expect(result.children[0].children[0].topic).toBe("Untitled");
  });

  it("treats a missing children array as empty", () => {
    expect(sanitizeNodeTree({ id: "r", topic: "R" }, "F", true).children).toEqual([]);
  });
});

describe("toMarkdown", () => {
  it("writes the title as a heading and the tree as nested bullets", () => {
    const tree = node("root", [
      node("a", [node("b", [node("c", [], "Queries")], "Self-attention")], "Attention"),
      node("d", [], "Training"),
    ]);
    expect(toMarkdown("Transformers", tree)).toBe(
      [
        "# Transformers",
        "",
        "- Attention",
        "  - Self-attention",
        "    - Queries",
        "- Training",
      ].join("\n")
    );
  });

  it("leaves special characters as they are", () => {
    const tree = node("root", [node("a", [], "*bold* # not a heading [x]")]);
    expect(toMarkdown("T", tree)).toBe("# T\n\n- *bold* # not a heading [x]");
  });

  it("is just the heading when the root has no children", () => {
    expect(toMarkdown("Title", node("root"))).toBe("# Title");
  });

  it("has no trailing newline", () => {
    expect(toMarkdown("T", node("root", [node("a")])).endsWith("\n")).toBe(false);
  });
});

describe("askPrompt", () => {
  it("names the topic and the context", () => {
    expect(askPrompt("Self-attention", "Attention")).toBe(
      "Discuss what these sources say about Self-attention, in the context of Attention."
    );
  });

  it("trims both inputs and keeps their case", () => {
    expect(askPrompt("  Self-Attention \n", "  ATTENTION ")).toBe(
      "Discuss what these sources say about Self-Attention, in the context of ATTENTION."
    );
  });
});

describe("collectBranchIds", () => {
  it("returns only nodes that have children, depth first", () => {
    const tree = node("root", [
      node("a", [node("a1"), node("a2", [node("a2x")])]),
      node("b"),
      node("c", [node("c1")]),
    ]);
    expect(collectBranchIds(tree)).toEqual(["root", "a", "a2", "c"]);
  });

  it("is empty for a lone root", () => {
    expect(collectBranchIds(node("root"))).toEqual([]);
  });
});
