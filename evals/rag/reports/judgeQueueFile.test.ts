import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadJudgeQueueFile } from "./judgeQueueFile";

describe("loadJudgeQueueFile", () => {
  it("reads items from the CLI queue shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "jq-"));
    const path = join(dir, "judge-queue.json");
    try {
      writeFileSync(
        path,
        JSON.stringify({
          instruction: "label me",
          items: [
            {
              id: 1,
              caseId: "c",
              runner: "chat",
              metric: "binary_judge_chat_grounding",
              modelStatus: "fail",
              score: 0,
              modelReason: "ungrounded",
              humanAgree: true,
            },
          ],
        })
      );
      const loaded = loadJudgeQueueFile(path);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.humanAgree).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
