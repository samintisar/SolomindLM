/**
 * Parses chat config overrides from the eval CLI (`--chat-config key=value[,key=value…]`) and
 * from sweep grid values. Keys and value types come from the production override definitions.
 */

import {
  CHAT_CONFIG_OVERRIDE_KEYS,
  type ChatConfigOverrideKey,
  type ChatConfigOverrides,
  validateChatConfigOverrides,
} from "../../convex/_agents/chat/chatConfigOverrides";

const FEW_SHOT_POLICY_NAMES = ["always", "complex-only", "never", "history-or-complex"] as const;

/** How each key's value is written on the command line. */
const VALUE_KIND: Record<ChatConfigOverrideKey, "integer" | "boolean" | "fullDoc" | "fewShot"> = {
  contextTokenBudget: "integer",
  listQueryContextTokenBudget: "integer",
  neighbourPassageTokenBudget: "integer",
  openingPassageTokenBudget: "integer",
  multiSourceMaxExtraTokens: "integer",
  hydeEnabled: "boolean",
  maxSubqueries: "integer",
  keywordVariants: "integer",
  fullDocumentExpansion: "fullDoc",
  fewShotPolicy: "fewShot",
  rerankEnabled: "boolean",
};

function isChatConfigOverrideKey(key: string): key is ChatConfigOverrideKey {
  return (CHAT_CONFIG_OVERRIDE_KEYS as readonly string[]).includes(key);
}

/** One value for a key, read from its command-line text. Throws on a wrong type. */
export function parseChatConfigValue(
  key: ChatConfigOverrideKey,
  raw: string
): ChatConfigOverrides[ChatConfigOverrideKey] {
  switch (VALUE_KIND[key]) {
    case "integer":
      if (!/^-?\d+$/.test(raw)) throw new Error(`${key} takes an integer, got "${raw}".`);
      return Number(raw);
    case "boolean":
      if (raw !== "true" && raw !== "false") {
        throw new Error(`${key} takes true or false, got "${raw}".`);
      }
      return raw === "true";
    case "fullDoc":
      if (raw === "on" || raw === "off") return raw;
      if (/^\d+$/.test(raw)) return Number(raw);
      throw new Error(`${key} takes on, off or a token cap (an integer), got "${raw}".`);
    case "fewShot": {
      const policy = FEW_SHOT_POLICY_NAMES.find((name) => name === raw);
      if (policy) return policy;
      throw new Error(`${key} takes one of ${FEW_SHOT_POLICY_NAMES.join(", ")}, got "${raw}".`);
    }
  }
}

/** The overrides a `--chat-config` value names. Throws with a message that names the problem. */
export function parseChatConfigFlag(value: string): ChatConfigOverrides {
  const overrides: ChatConfigOverrides = {};
  const seen = new Set<string>();
  for (const pair of value.split(",")) {
    const eq = pair.indexOf("=");
    const key = pair.slice(0, eq).trim();
    if (eq < 0 || key === "") {
      throw new Error(`--chat-config takes key=value pairs, got "${pair}".`);
    }
    if (!isChatConfigOverrideKey(key)) {
      throw new Error(
        `Unknown --chat-config key "${key}". Allowed: ${CHAT_CONFIG_OVERRIDE_KEYS.join(", ")}`
      );
    }
    if (seen.has(key)) throw new Error(`--chat-config sets "${key}" twice.`);
    seen.add(key);
    Object.assign(overrides, { [key]: parseChatConfigValue(key, pair.slice(eq + 1).trim()) });
  }
  const problems = validateChatConfigOverrides(overrides);
  if (problems.length > 0) throw new Error(`--chat-config: ${problems.join("; ")}`);
  return overrides;
}
