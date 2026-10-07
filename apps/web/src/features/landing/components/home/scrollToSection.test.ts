// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToSection } from "./scrollToSection";

describe("scrollToSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("smoothly scrolls the matching section to the top", () => {
    const section = document.createElement("section");
    section.id = "pricing";
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    document.body.append(section);

    scrollToSection("pricing");

    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does nothing when the section is not on the page", () => {
    expect(() => scrollToSection("missing")).not.toThrow();
  });
});
