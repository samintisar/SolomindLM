import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STUDIO_TILES } from "./landingHomeContent";
import { StudioMarquee } from "./StudioMarquee";

describe("StudioMarquee", () => {
  it("names each of the twelve Studio tools once for assistive tech", () => {
    render(<StudioMarquee />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Twelve ways to work with one notebook."
    );
    const list = screen.getByRole("list", { name: "Studio tools" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(STUDIO_TILES.length);
    for (const tile of STUDIO_TILES) {
      expect(within(list).getByText(new RegExp(`^${tile.title}:`))).toBeInTheDocument();
    }
  });

  it("hides the repeating marquee copies from assistive tech", () => {
    const { container } = render(<StudioMarquee />);
    const marquee = container.querySelector(".rfm-marquee-container")?.closest("[aria-hidden]");
    expect(marquee).toHaveAttribute("aria-hidden", "true");
    expect(marquee).toHaveAttribute("inert");
  });
});
