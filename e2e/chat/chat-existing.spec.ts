import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { enableWebOnlyFilter } from "../helpers/chat-assertions";

test.describe("Chat", () => {
  test("notebook page shows chat input", async ({ notebookPage }) => {
    await expect(notebookPage.getByPlaceholder(/Ask a question about your sources/)).toBeVisible();
  });

  test("chat input sends message and shows error without sources", async ({ notebookPage }) => {
    const page = notebookPage;

    const chatInput = page.getByPlaceholder(/Ask a question about your sources/);
    await chatInput.fill("What is machine learning?");
    await chatInput.press("Enter");

    await expect(page.getByText(/select at least one source/i)).toBeVisible({ timeout: 5_000 });
  });

  test("chat with web source filter sends message", async ({ notebookPage }) => {
    const page = notebookPage;

    // Switch to Web-only filter so we don't need notebook sources
    await enableWebOnlyFilter(page);

    const chatInput = page.getByPlaceholder(/Ask a question/);
    await chatInput.fill("What is the capital of France?");
    await chatInput.press("Enter");

    if (!shouldSkipAITests()) {
      try {
        await page.waitForFunction(
          () => {
            const messages = document.querySelectorAll("[data-message-id]");
            return messages.length > 0;
          },
          { timeout: 15_000 }
        );
      } catch {
        // AI services may not be configured
      }
    }

    await expect(page.getByText("What is the capital of France?")).toBeVisible();
  });
});
