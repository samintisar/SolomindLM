import { describe, expect, it } from "vitest";
import {
  buildCheckedImagePrompt,
  findNumbers,
  parseDesignFigures,
  verifyFigures,
} from "./figureCheck";

const SOURCE = [
  "Statisticians earned a median annual wage of $104,350 in May 2024.",
  "Employment of statisticians is projected to grow 11 percent from 2024 to 2034.",
  "Solar made up 20% of installed capacity at the end of 2025, and 81% of new capacity added from 2016 to 2025 was solar.",
].join("\n");

describe("findNumbers", () => {
  it("reads separators, decimals, scale words and years", () => {
    const found = findNumbers("$120,230 and 1.2 million and $104K in 2024");
    expect(found.map((n) => [n.value, n.isYear])).toEqual([
      [120230, false],
      [1_200_000, false],
      [104_000, false],
      [2024, true],
    ]);
  });

  it("skips layout sizes and ratios", () => {
    expect(findNumbers("A 1536x1024 poster, 16:9")).toEqual([]);
  });
});

describe("verifyFigures", () => {
  it("keeps a figure found in the sources with its label and period", () => {
    const { kept, dropped } = verifyFigures(
      [
        { value: "$104,350", label: "median annual wage", period: "2024" },
        { value: "11%", label: "projected employment growth", period: "2024-2034" },
      ],
      SOURCE
    );
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(2);
  });

  it("keeps a rounded figure", () => {
    const { kept } = verifyFigures([{ value: "~$104K", label: "median wage" }], SOURCE);
    expect(kept).toHaveLength(1);
  });

  it("drops an invented number", () => {
    const { dropped } = verifyFigures([{ value: "64,000", label: "homes with batteries" }], SOURCE);
    expect(dropped.map((d) => d.reason)).toEqual(["number_not_in_sources"]);
  });

  it("drops a number relabelled as something the source doesn't say", () => {
    const { dropped } = verifyFigures(
      [{ value: "20%", label: "share of electricity consumption" }],
      SOURCE
    );
    expect(dropped.map((d) => d.reason)).toEqual(["label_not_near_number"]);
  });

  it("drops a figure given the wrong period", () => {
    const { dropped } = verifyFigures(
      [{ value: "81%", label: "new capacity that was solar", period: "since 2020" }],
      SOURCE
    );
    expect(dropped.map((d) => d.reason)).toEqual(["period_not_near_number"]);
  });
});

describe("buildCheckedImagePrompt", () => {
  const kept = [{ value: "$104,350", label: "median annual wage", period: "2024" }];

  it("removes sentences with unchecked numbers and lists the checked figures", () => {
    const { prompt, removedSentences } = buildCheckedImagePrompt(
      "A clean three-panel layout. Panel 1 shows $104,350 median pay in 2024. Panel 2 shows a 70% oil cut. Use 3 icons.",
      kept
    );
    expect(removedSentences).toEqual(["Panel 2 shows a 70% oil cut."]);
    expect(prompt).toContain("Panel 1 shows $104,350 median pay in 2024.");
    expect(prompt).toContain("Use 3 icons.");
    expect(prompt).toContain("- $104,350: median annual wage (2024)");
  });

  it("removes a year that no checked figure has", () => {
    const { removedSentences } = buildCheckedImagePrompt("Every card is dated 2023.", kept);
    expect(removedSentences).toEqual(["Every card is dated 2023."]);
  });

  it("asks for no numbers when no figure was checked", () => {
    const { prompt } = buildCheckedImagePrompt("A timeline poster.", []);
    expect(prompt).toContain("Show no numbers, statistics or dates.");
  });
});

describe("parseDesignFigures", () => {
  it("keeps well-formed entries only", () => {
    expect(
      parseDesignFigures([
        { value: "35%", label: "growth", period: "2024-2034" },
        { value: "", label: "x" },
        "nope",
        { value: "$5", label: 3 },
      ])
    ).toEqual([
      { value: "35%", label: "growth", period: "2024-2034" },
      { value: "$5", label: "" },
    ]);
  });
});

describe("verifyFigures: direction", () => {
  const source = "Manufacturing employment fell 4% in 2025, while services employment rose 6%.";

  it("drops a growth figure the source reports as a fall", () => {
    const { dropped } = verifyFigures(
      [{ value: "+4%", label: "manufacturing employment", period: "2025" }],
      source
    );
    expect(dropped.map((d) => d.reason)).toEqual(["number_not_in_sources"]);
  });

  it("keeps a negative figure the source reports as a fall", () => {
    const { kept } = verifyFigures(
      [{ value: "-4%", label: "manufacturing employment", period: "2025" }],
      source
    );
    expect(kept).toHaveLength(1);
  });

  it("drops a negative figure the source reports as a rise", () => {
    const { dropped } = verifyFigures([{ value: "-6%", label: "services employment" }], source);
    expect(dropped).toHaveLength(1);
  });

  it("reads a year range as a range, not a negative year", () => {
    expect(findNumbers("2016-2025").map((n) => n.sign)).toEqual([0, 0]);
  });
});
