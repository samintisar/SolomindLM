import { describe, expect, it, vi } from "vitest";

// The structured-output stream is replaced with an empty one, so no request leaves the test and
// the reply is an error response; only the system prompt that was sent matters here.
import { MINIMAL_FEW_SHOT } from "./chat_llm_prompts";
import type { FewShotPolicy } from "./chatConfigOverrides";
import { ChatLLMWrapper } from "./llm_wrapper";

async function systemPromptSent(
  fewShotPolicy: FewShotPolicy | undefined,
  history: Array<{ role: string; content: string }>,
  question: string
): Promise<string> {
  const wrapper = new ChatLLMWrapper({
    apiKey: "test-key",
    model: "smart-model",
    fastModel: "fast-model",
    fewShotPolicy,
  });
  const create = vi.fn(async () => (async function* () {})());
  wrapper["togetherClient"] = {
    chat: { completions: { create } },
  } as unknown as ChatLLMWrapper["togetherClient"];

  await wrapper.generateStructuredResponse([], question, history);

  const request = create.mock.calls[0]?.[0] as {
    messages: Array<{ role: string; content: string }>;
  };
  return request.messages[0].content;
}

const turn = [{ role: "user", content: "earlier question" }];
const simple = "what is a tensor";
const complex = "compare tensors and matrices";

describe("few-shot examples in the system prompt", () => {
  it("are sent by default on a first turn", async () => {
    expect(await systemPromptSent(undefined, [], simple)).toContain(MINIMAL_FEW_SHOT);
  });

  it("are sent by default on a follow-up only for a complex question", async () => {
    expect(await systemPromptSent(undefined, turn, simple)).not.toContain(MINIMAL_FEW_SHOT);
    expect(await systemPromptSent(undefined, turn, complex)).toContain(MINIMAL_FEW_SHOT);
  });

  it("are always sent under the always policy", async () => {
    expect(await systemPromptSent("always", turn, simple)).toContain(MINIMAL_FEW_SHOT);
  });

  it("are never sent under the never policy", async () => {
    expect(await systemPromptSent("never", [], complex)).not.toContain(MINIMAL_FEW_SHOT);
  });

  it("ignore the first turn under the complex-only policy", async () => {
    expect(await systemPromptSent("complex-only", [], simple)).not.toContain(MINIMAL_FEW_SHOT);
    expect(await systemPromptSent("complex-only", [], complex)).toContain(MINIMAL_FEW_SHOT);
  });
});
