import { describe, expect, it } from "vitest";
import { DEV_PORT_RANGES, portCandidates, rewriteWebUrlPort } from "./devPorts";

const MAIN = { isMain: true, key: "C:/repo" };
const worktree = (key: string) => ({ isMain: false, key });

describe("portCandidates", () => {
  it("gives the main checkout the classic port first", () => {
    expect(portCandidates("web", MAIN)[0]).toBe(5173);
    expect(portCandidates("mobile", MAIN)[0]).toBe(8081);
  });

  it("lets the main checkout fall back across the whole range", () => {
    const { first, last } = DEV_PORT_RANGES.web;
    expect(portCandidates("web", MAIN)).toHaveLength(last - first + 1);
  });

  it("never offers a worktree the main checkout's port", () => {
    for (const server of ["web", "mobile"] as const) {
      const ports = portCandidates(server, worktree("C:/repo/.worktrees/a"));
      expect(ports).not.toContain(DEV_PORT_RANGES[server].first);
    }
  });

  it("keeps every worktree port inside the range, each once", () => {
    const { first, last } = DEV_PORT_RANGES.web;
    const ports = portCandidates("web", worktree("C:/repo/.worktrees/a"));
    expect(new Set(ports).size).toBe(last - first);
    for (const p of ports) {
      expect(p).toBeGreaterThan(first);
      expect(p).toBeLessThanOrEqual(last);
    }
  });

  it("is stable for the same worktree across runs", () => {
    const key = "C:/repo/.claude/worktrees/feature-x";
    expect(portCandidates("web", worktree(key))).toEqual(portCandidates("web", worktree(key)));
  });

  it("spreads different worktrees across different preferred ports", () => {
    const preferred = new Set(
      ["a", "b", "c", "d", "e", "f"].map((n) => portCandidates("web", worktree(`/w/${n}`))[0])
    );
    expect(preferred.size).toBeGreaterThan(1);
  });

  it("treats path case and slash style as the same worktree", () => {
    expect(portCandidates("web", worktree("C:\\Repo\\WT"))).toEqual(
      portCandidates("web", worktree("c:/repo/wt"))
    );
  });
});

describe("rewriteWebUrlPort", () => {
  it("moves a dev web URL to this checkout's port", () => {
    expect(rewriteWebUrlPort("http://192.168.68.110:5173", 5181)).toBe(
      "http://192.168.68.110:5181"
    );
    expect(rewriteWebUrlPort("http://10.0.2.2:5173/home", 5181)).toBe("http://10.0.2.2:5181/home");
  });

  it("leaves URLs outside the web dev range alone", () => {
    expect(rewriteWebUrlPort("https://solomindlm.com", 5181)).toBe("https://solomindlm.com");
    expect(rewriteWebUrlPort("http://localhost:3000", 5181)).toBe("http://localhost:3000");
  });

  it("leaves unparseable values alone", () => {
    expect(rewriteWebUrlPort("not a url", 5181)).toBe("not a url");
  });
});
