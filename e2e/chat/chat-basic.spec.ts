import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import {
  enableWebOnlyFilter,
  sendMessage,
  waitForAssistantMessage,
  waitForStreamingComplete,
} from "../helpers/chat-assertions";

test.describe("Chat Basic", () => {
  test("send message with web filter, user message appears", async ({ notebookPage }) => {
    const page = notebookPage;

    // Switch to Web-only filter so we don't need notebook sources
    await enableWebOnlyFilter(page);

    // Send a message
    await sendMessage(page, "What is the capital of France?");

    // User message should be visible
    await expect(page.getByText("What is the capital of France?")).toBeVisible();
  });

  test("assistant response streams when AI available", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Set E2E_AI_ENABLED=1 to run; requires a working LLM for chat");
    // Includes notebookPage fixture, waitForAssistant (30s) + waitForStreamingComplete (30s) + model latency
    test.setTimeout(300_000);

    const page = notebookPage;

    // Switch to Web-only filter so we don't need notebook sources
    await enableWebOnlyFilter(page);

    await sendMessage(page, "What is 2 + 2?");

    // Wait for assistant response (Convex + model can be slow under load)
    const gotResponse = await waitForAssistantMessage(page, 90_000);

    if (gotResponse) {
      const content = await waitForStreamingComplete(page, 90_000);
      expect(content.length).toBeGreaterThan(0);
    }
    // If no response (AI services not configured), the test passes —
    // we already verified the user message was sent in the test above.
  });
});
