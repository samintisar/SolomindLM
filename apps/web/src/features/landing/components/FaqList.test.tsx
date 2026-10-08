import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FaqList } from "./FaqList";

const FAQS = [
  { question: "Q1", answer: "A1", learnMorePath: "/students", learnMoreLabel: "Student tools" },
  { question: "Q2", answer: "A2" },
];

function renderList(defaultOpenIndex?: number) {
  render(
    <MemoryRouter>
      <FaqList faqs={FAQS} defaultOpenIndex={defaultOpenIndex} />
    </MemoryRouter>
  );
}

describe("FaqList", () => {
  it("keeps closed answers in the DOM but hidden", () => {
    renderList();
    expect(screen.getByText("A1")).not.toBeVisible();
    expect(screen.getByText("A2")).not.toBeVisible();
  });

  it("opens the default row and toggles on click", async () => {
    renderList(0);
    expect(screen.getByText("A1")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Q2" }));
    expect(screen.getByText("A2")).toBeVisible();
  });

  it("renders the learn-more link inside the answer", () => {
    renderList(0);
    expect(screen.getByRole("link", { name: /Student tools/ })).toHaveAttribute(
      "href",
      "/students"
    );
  });
});
