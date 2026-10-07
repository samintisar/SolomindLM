import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AudienceTabs } from "./AudienceTabs";

function renderTabs() {
  render(
    <MemoryRouter>
      <AudienceTabs />
    </MemoryRouter>
  );
}

describe("AudienceTabs", () => {
  it("opens on Students", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: "Students" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Nine days. Fourteen lectures. One notebook.")).toBeVisible();
    expect(screen.getByRole("link", { name: /SolomindLM for students/ })).toHaveAttribute(
      "href",
      "/students"
    );
  });

  it("switches to Researchers", async () => {
    renderTabs();
    await userEvent.click(screen.getByRole("tab", { name: "Researchers" }));
    expect(screen.getByText("From 200 papers to the 12 that matter.")).toBeVisible();
    expect(screen.getByRole("link", { name: /AI literature review/ })).toHaveAttribute(
      "href",
      "/research/ai-literature-review"
    );
  });
});
