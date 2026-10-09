import { expect, test } from "../fixtures/notebook.fixture";
import { shouldSkipAITests } from "../helpers/ai-service";
import {
  getLastAssistantMessageProse,
  sendMessage,
  waitForAssistantMessage,
  waitForChatInputReEnabled,
} from "../helpers/chat-assertions";
import {
  addPasteTextSource,
  getSourceCheckbox,
  waitForSourceStatus,
} from "../helpers/source-assertions";

test.describe("Chat With Sources", () => {
  test("chat with selected source produces response with citations", async ({ notebookPage }) => {
    test.skip(shouldSkipAITests(), "Requires AI embeddings + LLM");
    // notebookPage fixture + embeddings + full RAG turn under load
    test.setTimeout(720_000);

    const page = notebookPage;

    // Add a paste-text source
    const sourceText = `E2E Chat Source ${Date.now()}: Photosynthesis is the process by which green plants convert sunlight into chemical energy. This process occurs in chloroplasts and produces glucose and oxygen from carbon dioxide and water.`;
    const title = await addPasteTextSource(page, sourceText);
    await waitForSourceStatus(page, title, "completed", 180_000);

    // New sources start selected, so leave the checkbox alone (clicking it would deselect)
    await expect(getSourceCheckbox(page, title)).toBeChecked();

    // Send a question about the source content
    await sendMessage(page, "What is photosynthesis?");

    // Assistant row can appear while AgentActivityPanel updates — avoid polling prose until stream ends
    const gotResponse = await waitForAssistantMessage(page, 90_000);
    expect(gotResponse).toBeTruthy();
    await waitForChatInputReEnabled(page, 300_000);
    const content = await getLastAssistantMessageProse(page);
    expect(content.length).toBeGreaterThan(10);
    // Citation chips keep title="Reference N" (see CitationChip)
    const chip = page.getByTitle(/^Reference \d+$/).first();
    await expect(chip).toBeVisible({ timeout: 30_000 });

    // Clicking a chip pins the citation popover (Radix Popover, role="dialog" labelled "Reference N")
    await chip.click();
    await expect(page.getByRole("dialog", { name: /^Reference \d+$/ })).toBeVisible({
      timeout: 5_000,
    });
  });
});
