/** Alert copy for a 400/413 from the free tool, keyed by the server's `error` code. */
export function invalidTextMessage(error: string): { title: string; message: string } {
  switch (error) {
    case "text_too_short":
      return {
        title: "Add a bit more text",
        message: "Paste at least a few paragraphs of material.",
      };
    case "text_too_long":
    case "too_large":
      return {
        title: "That's longer than the free tool accepts",
        message: "Try fewer pages or paste a shorter section.",
      };
    default:
      return {
        title: "Check your text",
        message: "Something about that text couldn't be processed. Try pasting it again.",
      };
  }
}
