import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJobDeadline } from "../_job/jobDeadline";
import {
  planSpreadsheetRows,
  recursiveCollapse,
  writeSpreadsheetTable,
} from "./spreadsheetJobPhases";

const { invokeTogetherText } = vi.hoisted(() => ({ invokeTogetherText: vi.fn() }));

vi.mock("../../_agents/_shared/studioTextLlm", () => ({ invokeTogetherText }));

const SEPARATOR = "\n\n---\n\n";
// ~10k estimated tokens each (4 chars/token), so any two exceed the 15k collapse target.
const bigOutput = (tag: string) => tag.repeat(40_000);

function fakeClock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

beforeEach(() => {
  invokeTogetherText.mockReset();
});

describe("recursiveCollapse", () => {
  it("hands outputs to reduce as-is without any LLM call once the collapse budget is spent", async () => {
    const outputs = ["a", "b", "c"].map(bigOutput);

    const result = await recursiveCollapse(outputs, "", createJobDeadline(0));

    expect(result).toEqual(outputs);
    expect(invokeTogetherText).not.toHaveBeenCalled();
  });

  it("passes a trailing singleton group through without collapsing it", async () => {
    invokeTogetherText.mockResolvedValue("collapsed");
    const outputs = ["a", "b", "c"].map(bigOutput);

    const result = await recursiveCollapse(outputs, "", createJobDeadline(540_000));

    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["collapsed", outputs[2]]);
  });

  it("skips groups that start after the budget has run low instead of firing doomed calls", async () => {
    const clock = fakeClock();
    const deadline = createJobDeadline(540_000, clock.now);
    // The first collapse call uses up most of the budget; groups that start after it
    // must fall back to their uncollapsed text rather than call the LLM.
    invokeTogetherText.mockImplementation(async () => {
      clock.advance(250_000);
      return "collapsed";
    });
    const outputs = ["a", "b", "c", "d", "e", "f"].map(bigOutput);

    const result = await recursiveCollapse(outputs, "", deadline);

    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      "collapsed",
      [outputs[2], outputs[3]].join(SEPARATOR),
      [outputs[4], outputs[5]].join(SEPARATOR),
    ]);
  });
});

describe("planSpreadsheetRows", () => {
  const noUsage = () => {};

  it("returns the planned rows", async () => {
    invokeTogetherText.mockResolvedValue('{"rows": ["Alpha", "Beta"]}');

    const plan = await planSpreadsheetRows(
      "notes",
      "request",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(plan).toEqual(["Alpha", "Beta"]);
  });

  it("leaves the rows to the reduce when the plan call fails", async () => {
    invokeTogetherText.mockRejectedValue(new Error("bad gateway"));

    const plan = await planSpreadsheetRows(
      "notes",
      "request",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(plan).toEqual([]);
  });

  it("skips the plan call when the reduce needs what is left of the budget", async () => {
    const plan = await planSpreadsheetRows(
      "notes",
      "request",
      createJobDeadline(220_000),
      undefined,
      noUsage
    );

    expect(plan).toEqual([]);
    expect(invokeTogetherText).not.toHaveBeenCalled();
  });
});

describe("writeSpreadsheetTable", () => {
  const noUsage = () => {};
  const good = `"Paper","Year"
"ReAct","2022"`;

  it("returns a well-formed table from the first reduce", async () => {
    invokeTogetherText.mockResolvedValue(good);

    const csv = await writeSpreadsheetTable(
      "prompt",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe(good);
    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
  });

  it("writes a malformed table once more, naming what was wrong", async () => {
    invokeTogetherText.mockResolvedValueOnce(`"Kalai et al., 2025"`).mockResolvedValueOnce(good);

    const csv = await writeSpreadsheetTable(
      "prompt",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe(good);
    expect(invokeTogetherText).toHaveBeenCalledTimes(2);
    expect(invokeTogetherText.mock.calls[1][0].userPrompt).toContain(
      "no header row with at least two columns"
    );
  });

  it("fails rather than save a table that is malformed twice", async () => {
    invokeTogetherText.mockResolvedValue(`"Paper","Year"`);

    await expect(
      writeSpreadsheetTable("prompt", createJobDeadline(540_000), undefined, noUsage)
    ).rejects.toThrow("The spreadsheet came out malformed (no data rows).");
    expect(invokeTogetherText).toHaveBeenCalledTimes(2);
  });

  it("fails without a second reduce when the budget is nearly spent", async () => {
    invokeTogetherText.mockResolvedValue(`"Paper","Year"`);

    await expect(
      writeSpreadsheetTable("prompt", createJobDeadline(80_000), undefined, noUsage)
    ).rejects.toThrow("malformed");
    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
  });

  it("sends a badly formatted table back to be reformatted, without the notes", async () => {
    const ragged = `"Paper","Year"
"RAG","2020"
"ReAct","2022","extra"`;
    invokeTogetherText.mockResolvedValueOnce(ragged).mockResolvedValueOnce(good);

    const csv = await writeSpreadsheetTable(
      "NOTES",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe(good);
    const retry = invokeTogetherText.mock.calls[1][0];
    expect(retry.userPrompt).toContain(ragged);
    expect(retry.userPrompt).not.toContain("NOTES");
    expect(retry.reasoningEnabled).toBe(false);
  });

  it("saves a reply cut off at the output cap without its partial last row", async () => {
    invokeTogetherText.mockImplementation(async (options) => {
      options.onFinishReason?.("length");
      return `${good}
"Self-RAG","a cell cut off in the
middle`;
    });

    const csv = await writeSpreadsheetTable(
      "prompt",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe(good);
    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
  });

  it("keeps the last row of a complete reply however long it is", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => `"Paper ${i}","${"x".repeat(80)}"`);
    const long = [`"Paper","Notes"`, ...rows].join("\n");
    invokeTogetherText.mockImplementation(async (options) => {
      options.onFinishReason?.("stop");
      return long;
    });

    const csv = await writeSpreadsheetTable(
      "prompt",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(long.length).toBeGreaterThan(31_000);
    expect(csv).toBe(long);
  });

  it("builds the CSV from JSON rows", async () => {
    invokeTogetherText.mockResolvedValue(
      ['["Item","Amount"]', '["Net sales","$69,154"]', '["Note","said \\"up\\""]'].join("\n")
    );

    const csv = await writeSpreadsheetTable(
      "prompt",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe('"Item","Amount"\n"Net sales","$69,154"\n"Note","said ""up"""');
  });

  it("keeps every complete JSON row of a reply cut off at the output cap", async () => {
    invokeTogetherText.mockImplementation(async (options) => {
      options.onFinishReason?.("length");
      return '["Paper","Year"]\n["RAG","2020"]\n["ReAct","2022"]\n["Self-RAG","20';
    });

    const csv = await writeSpreadsheetTable(
      "prompt",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe('"Paper","Year"\n"RAG","2020"\n"ReAct","2022"');
    expect(invokeTogetherText).toHaveBeenCalledTimes(1);
  });

  it("asks for JSON rows when it sends a table back", async () => {
    invokeTogetherText
      .mockResolvedValueOnce('["Paper","Year"]\n["RAG","2020"]\n["ReAct","2022","extra"]')
      .mockResolvedValueOnce('["Paper","Year"]\n["RAG","2020"]\n["ReAct","2022"]');

    const csv = await writeSpreadsheetTable(
      "NOTES",
      createJobDeadline(540_000),
      undefined,
      noUsage
    );

    expect(csv).toBe('"Paper","Year"\n"RAG","2020"\n"ReAct","2022"');
    const retry = invokeTogetherText.mock.calls[1][0].userPrompt;
    expect(retry).toContain("as JSON lines");
    expect(retry).not.toContain("NOTES");
  });
});
