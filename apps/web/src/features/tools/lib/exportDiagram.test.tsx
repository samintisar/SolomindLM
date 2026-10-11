import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrismaDiagram } from "../components/PrismaDiagram";
import { serializeSvg } from "./exportDiagram";
import { createEmptyPrismaState } from "./prismaFlow";

describe("serializeSvg", () => {
  it("writes a standalone SVG with the counts and without page classes", () => {
    const state = createEmptyPrismaState();
    state.main.recordsScreened = 325;
    const { container } = render(<PrismaDiagram state={state} className="h-auto w-full" />);
    const svg = container.querySelector("svg")!;

    const text = serializeSvg(svg);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain("Records screened (n = 325)");
    expect(text).toContain('font-family="Arial, Helvetica, sans-serif"');
    expect(text).not.toContain("class=");
    expect(svg.getAttribute("class")).toBe("h-auto w-full");
  });
});
