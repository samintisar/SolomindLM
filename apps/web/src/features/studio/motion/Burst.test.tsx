import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let reduceMotion = false;
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => reduceMotion,
}));

import { Burst } from "./Burst";

describe("Burst", () => {
  beforeEach(() => {
    reduceMotion = false;
  });

  it("renders decorative particles with their own direction", () => {
    const { container } = render(<Burst />);
    const burst = container.querySelector("[data-slot=burst]");
    expect(burst).toHaveAttribute("aria-hidden", "true");
    const particles = burst?.querySelectorAll("span") ?? [];
    expect(particles.length).toBe(14);
    expect((particles[0] as HTMLElement).style.getPropertyValue("--burst-dx")).toMatch(/px$/);
  });

  it("renders nothing under reduced motion", () => {
    reduceMotion = true;
    const { container } = render(<Burst />);
    expect(container).toBeEmptyDOMElement();
  });
});
