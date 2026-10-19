import { describe, expect, it } from "vitest";
import { NEIGHBOUR_PASSAGE_TOKEN_BUDGET } from "../../convex/_agents/chat/chatConfig";
import { DEFAULT_FAST_MODEL_ID, DEFAULT_SMART_MODEL_ID } from "../../convex/_lib/defaultSmartModel";
import { computeConfigHash } from "./configHash";
import { snapshotRetrievalConfig } from "./runners/config";

describe("computeConfigHash", () => {
  it("is stable for the same snapshot", () => {
    const config = snapshotRetrievalConfig();
    expect(computeConfigHash(config)).toBe(computeConfigHash({ ...config }));
  });

  it("changes when only the neighbour passage budget changes", () => {
    const config = snapshotRetrievalConfig();
    const other = snapshotRetrievalConfig({
      neighbourPassageTokenBudget: config.neighbourPassageTokenBudget + 1,
    });
    expect(computeConfigHash(other)).not.toBe(computeConfigHash(config));
  });

  it("changes when only the chat prompt version changes", () => {
    const config = snapshotRetrievalConfig();
    const other = snapshotRetrievalConfig({ promptVersion: "2000-01-01" });
    expect(computeConfigHash(other)).not.toBe(computeConfigHash(config));
  });
});

describe("snapshotRetrievalConfig", () => {
  it("takes the model IDs from the shared defaults", () => {
    const config = snapshotRetrievalConfig();
    expect(config.fastModel).toBe(DEFAULT_FAST_MODEL_ID);
    expect(config.smartModel).toBe(DEFAULT_SMART_MODEL_ID);
  });

  it("reads the neighbour budget from the production chat config", () => {
    expect(snapshotRetrievalConfig().neighbourPassageTokenBudget).toBe(
      NEIGHBOUR_PASSAGE_TOKEN_BUDGET
    );
  });
});
