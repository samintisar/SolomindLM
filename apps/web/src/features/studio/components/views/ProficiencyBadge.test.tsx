import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Flashcard } from "@/shared/types";
import { ProficiencyBadge } from "./ProficiencyBadge";

function card(proficiency?: Partial<NonNullable<Flashcard["proficiency"]>>): Flashcard {
  return {
    front: "Q",
    back: "A",
    proficiency: proficiency as Flashcard["proficiency"],
  } as unknown as Flashcard;
}

function dotOf(label: string) {
  return screen.getByText(label).previousElementSibling as HTMLElement;
}

describe("ProficiencyBadge", () => {
  it("shows Mastered once the interval reaches 21 days", () => {
    render(<ProficiencyBadge card={card({ interval: 21 })} />);
    expect(dotOf("Mastered")).toHaveClass("bg-success", "size-1.5", "rounded-full");
  });

  it("shows Learning for a 7-day interval", () => {
    render(<ProficiencyBadge card={card({ interval: 7 })} />);
    expect(dotOf("Learning")).toHaveClass("bg-info");
  });

  it("shows the streak from three days", () => {
    render(<ProficiencyBadge card={card({ interval: 1, streak: 3 })} />);
    expect(dotOf("3-day streak")).toHaveClass("bg-warning");
  });

  it("shows Progressing at 70% accuracy or better", () => {
    render(<ProficiencyBadge card={card({ interval: 1, totalReviews: 10, correctCount: 8 })} />);
    expect(dotOf("Progressing")).toHaveClass("bg-primary");
  });

  it("shows Learning below 70% accuracy", () => {
    render(<ProficiencyBadge card={card({ interval: 1, totalReviews: 10, correctCount: 5 })} />);
    expect(dotOf("Learning")).toHaveClass("bg-info");
  });

  it("shows New with no proficiency", () => {
    render(<ProficiencyBadge card={card()} />);
    expect(dotOf("New")).toHaveClass("bg-muted-foreground/50");
  });
});
