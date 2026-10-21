import { describe, expect, it } from "vitest";
import { stripPageBoilerplate } from "./pageBoilerplate.helpers";

const ARTICLE = [
  "# Moon Phases",
  "The Moon's phases come from how much of its sunlit half we can see from Earth. As the Moon orbits Earth over about 29.5 days, the share of the lit side facing us grows and shrinks.",
  "## New Moon",
  "At new moon the Moon sits between Earth and the Sun, so the side facing us is dark. A few days later a thin crescent appears after sunset.",
].join("\n\n");

const strip = (page: string) => stripPageBoilerplate(page).text;

describe("stripPageBoilerplate", () => {
  it("keeps a normal article intact", () => {
    expect(strip(ARTICLE)).toBe(ARTICLE);
  });

  it("drops navigation menus and link lists", () => {
    const page = [
      "[Home](/) [Missions](/missions) [Humans in Space](/humans) [Earth](/earth) [The Solar System](/ss)",
      "* [Kuiper Belt](/kuiper)\n* [Aeronautics](/aero)\n* [Technology Transfer](/tt)\n* [Podcasts](/podcasts)",
      ARTICLE,
      "| [Actuaries](/a) | [Economists](/e) | [Mathematicians](/m) |\n|---|---|---|",
    ].join("\n\n");
    expect(strip(page)).toBe(ARTICLE);
  });

  it("drops short site-chrome blocks but keeps prose that mentions the same words", () => {
    const prose =
      "Researchers asked whether readers found the page helpful, and whether skipping to the main content changed what they remembered about the tides over the following week.";
    const page = [
      "Skip to main content",
      ARTICLE,
      "Was this page helpful?\n\nDid you find what you were looking for?",
      "Back to top",
      "<< Previous | Next >>",
      prose,
    ].join("\n\n");
    expect(strip(page)).toBe(`${ARTICLE}\n\n${prose}`);
  });

  it("drops link-out sections up to the next heading of the same level", () => {
    const page = [
      ARTICLE,
      "## Similar Occupations",
      "| Occupation | Duties | Pay |\n|---|---|---|\n| Actuaries | Use math to analyse risk | $120,000 |\n| Economists | Study production | $115,000 |",
      "## Pay",
      "The median wage was $98,000 in May 2023.",
    ].join("\n\n");
    expect(strip(page)).toBe(`${ARTICLE}\n\n## Pay\n\nThe median wage was $98,000 in May 2023.`);
  });

  it("keeps content headings that only look like link-out ones", () => {
    const page = [
      "## Related Rates",
      "Related rates problems connect how fast two quantities change when one depends on the other, such as a ladder sliding down a wall.",
      "## Popular Sovereignty",
      "Popular sovereignty is the principle that a government's authority comes from the people it governs.",
    ].join("\n\n");
    expect(strip(page)).toBe(page);
  });

  it("turns inline links into their text and drops short links tacked onto a sentence", () => {
    const page = [
      "Plan and direct the [shipment](/s) of goods across regions and suppliers. [Related occupations](/r)",
      "Review inventory levels against forecasts and adjust purchase orders when demand changes. [Related occupations](/r)",
    ].join("\n");
    expect(strip(page)).toBe(
      [
        "Plan and direct the shipment of goods across regions and suppliers.",
        "Review inventory levels against forecasts and adjust purchase orders when demand changes.",
      ].join("\n")
    );
  });

  it("splits values glued across table cells", () => {
    expect(strip("2023 Median Pay: $120,230 per year$57.80 per hour")).toBe(
      "2023 Median Pay: $120,230 per year; $57.80 per hour"
    );
  });

  it("keeps a page that is really a list of links", () => {
    const page = "* [Reading 1](/1)\n* [Reading 2](/2)\n* [Reading 3](/3)";
    expect(stripPageBoilerplate(page)).toEqual({ text: page, removedShare: 0 });
  });

  it("reports the share removed", () => {
    const page = `[Home](/) [About](/about) [Contact](/contact)\n\n${ARTICLE}`;
    const result = stripPageBoilerplate(page);
    expect(result.removedShare).toBeGreaterThan(0);
    expect(result.removedShare).toBeLessThan(0.2);
  });
});
