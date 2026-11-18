import { describe, expect, it } from "vitest";
import { studioErrorMessage } from "./studioErrorMessage";

describe("studioErrorMessage", () => {
  it("returns a stored string", () => {
    expect(studioErrorMessage("Model timed out")).toBe("Model timed out");
  });

  it("returns an object's string message", () => {
    expect(studioErrorMessage({ message: "Quota exceeded" })).toBe("Quota exceeded");
  });

  it("falls back for empty, non-string or missing errors", () => {
    expect(studioErrorMessage("")).toBe("An unknown error occurred");
    expect(studioErrorMessage({ message: 42 })).toBe("An unknown error occurred");
    expect(studioErrorMessage(undefined, "Audio failed")).toBe("Audio failed");
  });
});
