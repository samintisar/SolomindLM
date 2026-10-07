import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Favicon } from "./Favicon";

function requestedSize(img: HTMLElement): string | null {
  return new URL(img.getAttribute("src") ?? "").searchParams.get("sz");
}

describe("Favicon", () => {
  test.each([
    [14, "32"],
    [16, "32"],
    [20, "64"],
  ])("requests a sharper icon than the %ipx it shows", (size, sz) => {
    render(<Favicon url="https://arxiv.org/abs/2210.03629" size={size} />);

    const img = screen.getByRole("img", { name: "arxiv.org favicon" });
    expect(requestedSize(img)).toBe(sz);
    expect(img).toHaveAttribute("width", String(size));
  });

  // A centring parent (the source tile) must be able to centre it (#378).
  test("leaves its alignment to the parent", () => {
    render(<Favicon url="https://arxiv.org" />);
    const img = screen.getByRole("img");
    expect(img.className).not.toContain("self-start");

    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("span")?.className).not.toContain("self-start");
  });
});
