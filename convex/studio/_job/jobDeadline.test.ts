import { describe, expect, it } from "vitest";
import { createJobDeadline } from "./jobDeadline";

function fakeClock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createJobDeadline", () => {
  it("counts remaining time down from the budget", () => {
    const clock = fakeClock();
    const deadline = createJobDeadline(10_000, clock.now);

    clock.advance(4_000);

    expect(deadline.remainingMs()).toBe(6_000);
  });

  it("caps a step timeout at the step's own limit when plenty of budget remains", () => {
    const deadline = createJobDeadline(10_000, fakeClock().now);

    expect(deadline.stepTimeoutMs(3_000)).toBe(3_000);
  });

  it("shrinks a step timeout to what is left after reserving time for later steps", () => {
    const clock = fakeClock();
    const deadline = createJobDeadline(10_000, clock.now);

    clock.advance(6_000);

    expect(deadline.stepTimeoutMs(5_000, 1_000)).toBe(3_000);
  });

  it("never returns a negative step timeout once the budget is spent", () => {
    const clock = fakeClock();
    const deadline = createJobDeadline(10_000, clock.now);

    clock.advance(12_000);

    expect(deadline.remainingMs()).toBe(0);
    expect(deadline.stepTimeoutMs(5_000, 1_000)).toBe(0);
  });
});
