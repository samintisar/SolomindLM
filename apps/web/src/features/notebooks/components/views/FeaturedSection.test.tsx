import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { FeaturedSection } from "./FeaturedSection";

describe("FeaturedSection", () => {
  test("renders nothing when empty unless showEmpty is set", () => {
    const { container, rerender } = render(
      <FeaturedSection featuredNotebooks={[]} viewMode="grid" onSelectNotebook={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <FeaturedSection
        featuredNotebooks={[]}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        showEmpty
      />
    );
    expect(screen.getByText("No featured notebooks yet.")).toBeInTheDocument();
  });
});
