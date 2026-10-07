import { describe, expect, test } from "vitest";
import { invalidTextMessage } from "./invalidTextMessage";

describe("invalidTextMessage", () => {
  test("text_too_short asks for more text", () => {
    expect(invalidTextMessage("text_too_short")).toEqual({
      title: "Add a bit more text",
      message: "Paste at least a few paragraphs of material.",
    });
  });

  test.each(["text_too_long", "too_large"])("%s says the text is too long", (error) => {
    expect(invalidTextMessage(error)).toEqual({
      title: "That's longer than the free tool accepts",
      message: "Try fewer pages or paste a shorter section.",
    });
  });

  test.each(["invalid_body", "missing_token", ""])(
    "%j falls back to a generic message",
    (error) => {
      expect(invalidTextMessage(error)).toEqual({
        title: "Check your text",
        message: "Something about that text couldn't be processed. Try pasting it again.",
      });
    }
  );
});
