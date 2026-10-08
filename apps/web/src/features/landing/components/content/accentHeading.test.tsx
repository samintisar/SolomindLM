import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccentHeading } from "./accentHeading";

describe("AccentHeading", () => {
  it("wraps the accent phrase in <em> and keeps the full text", () => {
    render(
      <h1>
        <AccentHeading text="Make AI flashcards from your PDF in minutes" accent="from your PDF" />
      </h1>
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Make AI flashcards from your PDF in minutes"
    );
    expect(screen.getByText("from your PDF").tagName).toBe("EM");
  });

  it("renders plain text when the accent is missing or not found", () => {
    render(
      <h1>
        <AccentHeading text="Plain" accent="nope" />
      </h1>
    );
    expect(screen.getByRole("heading", { level: 1 }).querySelector("em")).toBeNull();
  });
});
