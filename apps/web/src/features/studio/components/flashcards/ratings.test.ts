import { describe, expect, it } from "vitest";
import { RATINGS, ratingForKey } from "./ratings";

describe("ratings", () => {
  it("maps keys to ratings", () => {
    expect(ratingForKey("1")?.rating).toBe("again");
    expect(ratingForKey("4")?.rating).toBe("easy");
    expect(ratingForKey("5")).toBeUndefined();
  });

  it("lists the four ratings in order", () => {
    expect(RATINGS.map((r) => r.rating)).toEqual(["again", "hard", "good", "easy"]);
  });

  it("gives each rating a unique key", () => {
    expect(new Set(RATINGS.map((r) => r.key)).size).toBe(4);
  });
});
