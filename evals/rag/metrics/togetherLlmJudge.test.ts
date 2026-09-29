import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTogetherJudgeInvoker } from "./togetherLlmJudge";

const create = vi.fn();

vi.mock("together-ai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const choice = (message: Record<string, unknown>, finish_reason = "stop") => ({
  choices: [{ message, finish_reason }],
});

describe("createTogetherJudgeInvoker", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("gives reasoning judges enough output budget for long judge prompts", async () => {
    create.mockResolvedValueOnce(choice({ content: '{"pass": true, "reason": "ok"}' }));

    await createTogetherJudgeInvoker({ apiKey: "k" })("prompt");

    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(8192);
  });

  it("returns the JSON content", async () => {
    create.mockResolvedValueOnce(choice({ content: '{"pass": true, "reason": "ok"}' }));

    await expect(createTogetherJudgeInvoker({ apiKey: "k" })("prompt")).resolves.toBe(
      '{"pass": true, "reason": "ok"}'
    );
  });

  it("does not hand back reasoning prose as the verdict when content is empty", async () => {
    create.mockResolvedValueOnce(
      choice({ content: "", reasoning: "We need to judge whether the script..." }, "length")
    );

    await expect(createTogetherJudgeInvoker({ apiKey: "k" })("prompt")).rejects.toThrow(
      /no JSON verdict.*finish_reason=length/i
    );
  });

  it("rejects truncated reasoning prose that leaked into content", async () => {
    create.mockResolvedValueOnce(
      choice({ content: "We need answer only JSON. The script covers" }, "length")
    );

    await expect(createTogetherJudgeInvoker({ apiKey: "k" })("prompt")).rejects.toThrow(
      /no JSON verdict/i
    );
  });

  it("extracts the verdict when reasoning prose precedes it in content", async () => {
    create.mockResolvedValueOnce(
      choice({ content: 'We check each rule {like this}. Final:\n{"pass": true, "reason": "ok"}' })
    );

    await expect(createTogetherJudgeInvoker({ apiKey: "k" })("prompt")).resolves.toBe(
      '{"pass": true, "reason": "ok"}'
    );
  });

  it("still accepts a JSON verdict that arrived in the reasoning field", async () => {
    create.mockResolvedValueOnce(
      choice({ content: "", reasoning: '{"pass": false, "reason": "missing items"}' })
    );

    await expect(createTogetherJudgeInvoker({ apiKey: "k" })("prompt")).resolves.toBe(
      '{"pass": false, "reason": "missing items"}'
    );
  });
});
