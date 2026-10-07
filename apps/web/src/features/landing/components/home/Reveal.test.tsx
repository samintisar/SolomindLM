import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";

describe("Reveal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows its content at once when IntersectionObserver is missing", () => {
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText("Hello")).toHaveAttribute("data-shown", "true");
  });

  it("stays hidden until the content scrolls into view, then stays shown", () => {
    let fire: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe = vi.fn();
        disconnect = disconnect;
      }
    );

    render(<Reveal>Hello</Reveal>);
    const el = screen.getByText("Hello");
    expect(el).toHaveAttribute("data-shown", "false");

    act(() => fire([{ isIntersecting: true }]));

    expect(el).toHaveAttribute("data-shown", "true");
    expect(disconnect).toHaveBeenCalled();
  });
});
