import { describe, expect, it } from "vitest";
import { parseSeedArgs } from "./seedArgs";

const known = ["language-learners", "medical-students"];

describe("parseSeedArgs", () => {
  it("selects every known pack with no args", () => {
    expect(parseSeedArgs([], known)).toEqual(known);
  });

  it("parses a comma-separated list after --use-case", () => {
    expect(parseSeedArgs(["--use-case", "a, b"], known)).toEqual(["a", "b"]);
  });

  it("parses --use-case=<ids>", () => {
    expect(parseSeedArgs(["--use-case=a"], known)).toEqual(["a"]);
  });

  it("expands 'all' to every known pack", () => {
    expect(parseSeedArgs(["--use-case", "all"], known)).toEqual(known);
  });

  it("rejects --use-case without a value", () => {
    const message = "--use-case needs a value: <ids,comma-separated> or all";
    expect(() => parseSeedArgs(["--use-case"], known)).toThrow(message);
    expect(() => parseSeedArgs(["--use-case="], known)).toThrow(message);
    expect(() => parseSeedArgs(["--use-case", ","], known)).toThrow(message);
  });

  it("rejects --use-case followed by another flag", () => {
    expect(() => parseSeedArgs(["--use-case", "--foo"], known)).toThrow("--use-case needs a value");
  });

  it("rejects unknown options such as --usecase", () => {
    expect(() => parseSeedArgs(["--usecase", "x"], known)).toThrow(
      "Unknown option --usecase. Usage: bun run eval:seed [-- --use-case <ids|all>]"
    );
  });

  it("rejects stray positional arguments", () => {
    const usage = "Usage: bun run eval:seed [-- --use-case <ids|all>]";
    expect(() => parseSeedArgs(["language-learners"], known)).toThrow(
      `Unexpected argument language-learners. ${usage}`
    );
    expect(() => parseSeedArgs(["--use-case", "a", "b"], known)).toThrow(
      `Unexpected argument b. ${usage}`
    );
  });
});
