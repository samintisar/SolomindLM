import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LANDING_FAQS } from "../../faqRegistry";
import { FaqSection } from "./FaqSection";

function renderFaq() {
  render(
    <MemoryRouter>
      <FaqSection />
    </MemoryRouter>
  );
}

describe("FaqSection", () => {
  it("lists every homepage question, the first one open", () => {
    renderFaq();
    for (const faq of LANDING_FAQS) {
      expect(screen.getByRole("button", { name: faq.question })).toBeInTheDocument();
    }
    expect(screen.getByText(LANDING_FAQS[0].answer)).toBeVisible();
    expect(screen.queryByText(LANDING_FAQS[1].answer)).not.toBeInTheDocument();
  });

  it("opens and closes a question", async () => {
    renderFaq();
    const second = screen.getByRole("button", { name: LANDING_FAQS[1].question });
    await userEvent.click(second);
    expect(screen.getByText(LANDING_FAQS[1].answer)).toBeVisible();
    expect(second).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(second);
    expect(screen.queryByText(LANDING_FAQS[1].answer)).not.toBeInTheDocument();
  });

  it("links to support and to the full FAQ", () => {
    renderFaq();
    expect(screen.getByRole("link", { name: "support@solomindlm.com" })).toHaveAttribute(
      "href",
      "mailto:support@solomindlm.com"
    );
    expect(screen.getByRole("link", { name: /See all questions/ })).toHaveAttribute("href", "/faq");
  });
});
