import { describe, expect, test } from "vitest";
import { computeAnchoredPosition } from "./anchoredPosition";

const phone = { width: 390, height: 844 };

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, right: left + width, bottom: top + height };
}

describe("computeAnchoredPosition", () => {
  test("start-aligned panel is pulled back inside the right edge", () => {
    // Filters button mid-toolbar, 304px panel: rect.left + width would end at 454px.
    const pos = computeAnchoredPosition({
      anchor: rect(150, 780, 36, 36),
      panel: { width: 304, height: 280 },
      viewport: phone,
      side: "top",
      align: "start",
    });
    expect(pos.left).toBe(390 - 8 - 304);
    expect(pos.side).toBe("top");
    expect(pos.bottom).toBe(844 - 780 + 8);
  });

  test("end-aligned panel is pushed inside the left edge", () => {
    const pos = computeAnchoredPosition({
      anchor: rect(10, 100, 30, 30),
      panel: { width: 200, height: 100 },
      viewport: phone,
      side: "bottom",
      align: "end",
    });
    expect(pos.left).toBe(8);
    expect(pos.top).toBe(138);
  });

  test("keeps the natural position when it fits", () => {
    const pos = computeAnchoredPosition({
      anchor: rect(40, 100, 30, 30),
      panel: { width: 200, height: 100 },
      viewport: phone,
      side: "bottom",
      align: "start",
    });
    expect(pos.left).toBe(40);
    expect(pos.side).toBe("bottom");
  });

  test("flips upward when there is no room below", () => {
    const pos = computeAnchoredPosition({
      anchor: rect(300, 780, 30, 30),
      panel: { width: 144, height: 120 },
      viewport: phone,
      side: "bottom",
      align: "end",
    });
    expect(pos.side).toBe("top");
    expect(pos.bottom).toBe(844 - 780 + 8);
    expect(pos.maxHeight).toBe(780 - 8 - 8);
  });

  test("stays on the preferred side when the other side is no roomier", () => {
    const pos = computeAnchoredPosition({
      anchor: rect(100, 60, 30, 30),
      panel: { width: 144, height: 400 },
      viewport: { width: 390, height: 300 },
      side: "top",
      align: "start",
    });
    // 44px above vs 194px below: flip to the roomier side and cap height.
    expect(pos.side).toBe("bottom");
    expect(pos.maxHeight).toBe(300 - 98 - 8);
  });

  test("caps width to the viewport when the panel is wider than it", () => {
    const pos = computeAnchoredPosition({
      anchor: rect(100, 100, 30, 30),
      panel: { width: 500, height: 100 },
      viewport: { width: 320, height: 600 },
      side: "bottom",
      align: "start",
    });
    expect(pos.left).toBe(8);
    expect(pos.maxWidth).toBe(304);
  });
});
