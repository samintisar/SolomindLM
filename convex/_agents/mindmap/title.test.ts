import { describe, expect, it } from "vitest";
import { mindMapTitleSource } from "./title";

describe("mindMapTitleSource", () => {
  it("describes the finished map: its root and main branches", () => {
    const source = mindMapTitleSource(
      {
        nodeData: {
          topic: "Energy Outlook: Crude Oil and Diesel",
          children: [
            { topic: "Crude Oil Price Forecasts", children: [{ topic: "Brent", children: null }] },
            { topic: "Diesel Prices", children: null },
          ],
        },
      },
      ["Feed grains: corn production cut", "Energy: oil prices"]
    );
    expect(source).toBe(
      "Energy Outlook: Crude Oil and Diesel: Crude Oil Price Forecasts; Diesel Prices"
    );
    // The extraction from the first source is not what the title is written from.
    expect(source).not.toContain("Feed grains");
  });

  it("falls back to the extractions when the map has no root topic", () => {
    const source = mindMapTitleSource({ nodeData: { topic: "", children: null } }, [
      "Theme A: summary",
      "Theme B: summary",
    ]);
    expect(source).toBe("Theme A: summary Theme B: summary");
  });

  it("caps the text at 2000 characters", () => {
    const source = mindMapTitleSource({ nodeData: { topic: "", children: null } }, [
      "x".repeat(3000),
    ]);
    expect(source).toHaveLength(2000);
  });
});
