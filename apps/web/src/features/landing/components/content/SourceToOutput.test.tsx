import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INTENT_LANDING_PAGES } from "../../intentLandingPages";
import { SourceToOutput } from "./SourceToOutput";

function flashcardsPage() {
  const page = INTENT_LANDING_PAGES.find((p) => p.intentKey === "flashcards");
  if (!page) throw new Error("flashcards page missing");
  return page;
}

describe("SourceToOutput", () => {
  it("keeps the labels and both captions readable, outside the hidden pictures", () => {
    const page = flashcardsPage();
    render(<SourceToOutput intentKey={page.intentKey} caption={page.sourceToOutput} />);

    for (const text of [
      "Your source",
      "What you get",
      page.sourceToOutput.source,
      page.sourceToOutput.output,
    ]) {
      const element = screen.getByText(text);
      expect(element).toBeInTheDocument();
      expect(element.closest("[aria-hidden]"), text).toBeNull();
      expect(element.closest("[inert]"), text).toBeNull();
    }
  });

  it("hides both pictures from assistive tech and keyboard focus", () => {
    const page = flashcardsPage();
    const { container } = render(
      <SourceToOutput intentKey={page.intentKey} caption={page.sourceToOutput} />
    );

    const pictures = container.querySelectorAll("[inert]");
    expect(pictures).toHaveLength(2);
    for (const picture of pictures) {
      expect(picture).toHaveAttribute("aria-hidden", "true");
    }
    // The source picture holds the source file cards; the output picture holds the flashcard demo.
    expect(pictures[0]).toHaveTextContent("Ch. 10 · Beta blockers.pdf");
    expect(pictures[1]).toHaveTextContent(/flashcard/i);
  });

  it("renders nothing for a tool without a scene", () => {
    const { container } = render(
      <SourceToOutput intentKey="notATool" caption={{ source: "a", output: "b" }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
