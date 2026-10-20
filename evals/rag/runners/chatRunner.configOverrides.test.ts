import { describe, expect, it } from "vitest";
import { getFixture } from "../fixtures";
import { runChatEval } from "./chatRunner";
import { snapshotRetrievalConfig } from "./config";

describe("runChatEval dry run", () => {
  it("records the requested overrides on the stub artifact", async () => {
    const overrides = { hydeEnabled: false, contextTokenBudget: 4000 };
    const { artifact } = await runChatEval({
      fixture: getFixture("ml-factoid-decision-stump"),
      config: snapshotRetrievalConfig({ overrides }),
      dryRun: true,
    });
    expect(artifact.configOverrides).toEqual(overrides);
  });

  it("leaves configOverrides out when the run has none", async () => {
    const { artifact } = await runChatEval({
      fixture: getFixture("ml-factoid-decision-stump"),
      config: snapshotRetrievalConfig(),
      dryRun: true,
    });
    expect(artifact.configOverrides).toBeUndefined();
  });
});
