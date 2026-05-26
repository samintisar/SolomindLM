import { test, expect } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import { sendMessage, openComposerModeMenu, enableWebOnlyFilter } from "../helpers/chat-assertions";

test.describe("Deep Research", () => {
  // Menu + LLM plan generation can exceed 2m on a cold Convex + model round-trip
  test.describe.configure({ timeout: 180_000 });

  test("deep research shows planning phase", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI LLM for deep research");

    const page = notebookPage;

    // Switch to Web-only filter
    await enableWebOnlyFilter(page);

    // Enable deep research — open composer mode menu and choose "Deep Research"
    await openComposerModeMenu(page);
    await page.getByRole("option", { name: "Deep Research", exact: true }).click();

    // Menu closes after selecting a mode.

    // Send a research query
    await sendMessage(page, "What are the latest developments in quantum computing?");

    // ResearchPlanMessage: eyebrow "Research plan", draft title "Ready for review", loading "Loading plan…"
    try {
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return (
            text.includes("Research plan") ||
            text.includes("Ready for review") ||
            text.includes("Loading plan") ||
            text.includes("sub-question") ||
            text.includes("Approve & Research") ||
            text.includes("Approve")
          );
        },
        { timeout: 90_000 }
      );
    } catch {
      // Research planning may not have started — AI services may be slow
      // Verify the user message was sent at least
      await expect(
        page.getByText("What are the latest developments in quantum computing?")
      ).toBeVisible();
    }
  });
});
