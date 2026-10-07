import { render, screen, within } from "@testing-library/react";
import { Layers } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LinkCard } from "./LinkCard";

describe("LinkCard", () => {
  it("is one link to the target that holds the title and description", () => {
    render(
      <MemoryRouter>
        <LinkCard
          to="/ai-flashcards"
          title="Flashcards"
          description="Spaced repetition from your own PDF."
          icon={Layers}
          tone="flashcard"
        />
      </MemoryRouter>
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link).toHaveAttribute("href", "/ai-flashcards");
    expect(within(link).getByRole("heading", { level: 3, name: "Flashcards" })).toBeInTheDocument();
    expect(within(link).getByText("Spaced repetition from your own PDF.")).toBeInTheDocument();
    const icon = link.firstElementChild;
    expect(icon?.tagName).toBe("SPAN");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.querySelector("svg")).not.toBeNull();
  });
});
