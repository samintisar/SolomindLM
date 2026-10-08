import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToTop } from "./ScrollToTop";

describe("ScrollToTop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the top of the page on a malformed hash instead of throwing", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    expect(() =>
      render(
        <MemoryRouter initialEntries={["/#50%"]}>
          <ScrollToTop />
        </MemoryRouter>
      )
    ).not.toThrow();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });
});
