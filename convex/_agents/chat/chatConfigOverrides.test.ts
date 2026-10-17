import { describe, expect, it } from "vitest";
import {
  CONTEXT_TOKEN_BUDGET,
  LIST_QUERY_CONTEXT_TOKEN_BUDGET,
  MULTI_SOURCE_MAX_EXTRA_TOKENS,
  NEIGHBOUR_PASSAGE_TOKEN_BUDGET,
  OPENING_PASSAGE_TOKEN_BUDGET,
} from "./chatConfig";
import {
  CHAT_CONFIG_OVERRIDE_KEYS,
  type ChatConfigOverrides,
  chatConfigOverridesValidator,
  resolveChatConfig,
  validateChatConfigOverrides,
} from "./chatConfigOverrides";

describe("resolveChatConfig with no overrides", () => {
  it("equals today's constants and env values", () => {
    expect(resolveChatConfig()).toEqual({
      contextTokenBudget: CONTEXT_TOKEN_BUDGET,
      listQueryContextTokenBudget: LIST_QUERY_CONTEXT_TOKEN_BUDGET,
      neighbourPassageTokenBudget: NEIGHBOUR_PASSAGE_TOKEN_BUDGET,
      openingPassageTokenBudget: OPENING_PASSAGE_TOKEN_BUDGET,
      multiSourceMaxExtraTokens: MULTI_SOURCE_MAX_EXTRA_TOKENS,
      hydeEnabled: true,
      maxSubqueries: 6,
      keywordVariants: 2,
      fullDocumentExpansion: "on",
      fewShotPolicy: "history-or-complex",
      rerankEnabled: true,
    });
  });

  it("treats an empty object like no overrides", () => {
    expect(resolveChatConfig({})).toEqual(resolveChatConfig());
  });

  it("ignores keys set to undefined", () => {
    expect(resolveChatConfig({ hydeEnabled: undefined })).toEqual(resolveChatConfig());
  });
});

describe("resolveChatConfig with overrides", () => {
  const samples: ChatConfigOverrides[] = [
    { contextTokenBudget: 4000 },
    { listQueryContextTokenBudget: 3000 },
    { neighbourPassageTokenBudget: 0 },
    { openingPassageTokenBudget: 1500 },
    { multiSourceMaxExtraTokens: 0 },
    { hydeEnabled: false },
    { maxSubqueries: 2 },
    { keywordVariants: 0 },
    { fullDocumentExpansion: "off" },
    { fullDocumentExpansion: 6000 },
    { fewShotPolicy: "never" },
    { rerankEnabled: false },
  ];

  it.each(samples)("lands %o in the resolved config", (override) => {
    const resolved = resolveChatConfig(override);
    for (const [key, value] of Object.entries(override)) {
      expect(resolved[key as keyof typeof resolved]).toBe(value);
    }
  });

  it("keeps the defaults for keys left out", () => {
    const resolved = resolveChatConfig({ hydeEnabled: false });
    expect(resolved.contextTokenBudget).toBe(CONTEXT_TOKEN_BUDGET);
    expect(resolved.keywordVariants).toBe(2);
  });
});

describe("validateChatConfigOverrides", () => {
  it("accepts the boundary values", () => {
    expect(
      validateChatConfigOverrides({
        maxSubqueries: 1,
        keywordVariants: 0,
        contextTokenBudget: 1,
        multiSourceMaxExtraTokens: 0,
        fullDocumentExpansion: 1,
      })
    ).toEqual([]);
    expect(
      validateChatConfigOverrides({
        maxSubqueries: 6,
        keywordVariants: 2,
        fullDocumentExpansion: "on",
      })
    ).toEqual([]);
  });

  it.each([
    [{ maxSubqueries: 0 }],
    [{ maxSubqueries: 7 }],
    [{ keywordVariants: 3 }],
    [{ keywordVariants: -1 }],
    [{ contextTokenBudget: 0 }],
    [{ listQueryContextTokenBudget: 1.5 }],
    [{ neighbourPassageTokenBudget: -5 }],
    [{ openingPassageTokenBudget: Number.NaN }],
    [{ multiSourceMaxExtraTokens: -1 }],
    [{ fullDocumentExpansion: 0 }],
    [{ fullDocumentExpansion: 2.5 }],
  ])("reports %o", (override) => {
    expect(validateChatConfigOverrides(override as ChatConfigOverrides).length).toBeGreaterThan(0);
  });

  it("makes resolveChatConfig throw for an out-of-range value", () => {
    expect(() => resolveChatConfig({ maxSubqueries: 7 })).toThrow(/maxSubqueries/);
  });
});

describe("chat config override keys", () => {
  it("lists exactly the fields of the Convex validator", () => {
    expect([...CHAT_CONFIG_OVERRIDE_KEYS].sort()).toEqual(
      Object.keys(chatConfigOverridesValidator.fields).sort()
    );
  });
});
