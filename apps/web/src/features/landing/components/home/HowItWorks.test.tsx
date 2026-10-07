import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "./HowItWorks";

describe("HowItWorks", () => {
  it("is the #features section with the three beats in order", () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector("section#features")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Read it. Practise it. Go deeper."
    );
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Every answer shows its working.",
      "Then it makes you prove you know it.",
      "When the slides aren't enough.",
    ]);
  });

  it("lists quizzes on their own line in Practise it", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Quizzes that explain every answer")).toBeInTheDocument();
  });
});
