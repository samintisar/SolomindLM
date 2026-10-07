import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STUDIO_TILES } from "./landingHomeContent";
import { StudioMarquee } from "./StudioMarquee";

describe("StudioMarquee", () => {
  it("names all twelve Studio tools", () => {
    render(<StudioMarquee />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Twelve ways to work with one notebook."
    );
    for (const tile of STUDIO_TILES) {
      expect(screen.getAllByText(tile.title).length).toBeGreaterThan(0);
    }
  });
});
