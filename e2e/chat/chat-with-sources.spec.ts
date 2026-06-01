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
  PASTED_TEXT_TITLE,
  selectSource,
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
    await addPasteTextSource(page, sourceText);
    // List title is the default "Pasted Text", not the full pasted body (see paste-text.spec.ts)
    await waitForSourceStatus(page, PASTED_TEXT_TITLE, "completed", 180_000);

    // Select the source
    await selectSource(page, PASTED_TEXT_TITLE);

    // Send a question about the source content
    await sendMessage(page, "What is photosynthesis?");

    // Assistant row can appear while AgentActivityPanel updates — avoid polling prose until stream ends
    const gotResponse = await waitForAssistantMessage(page, 90_000);
    expect(gotResponse).toBeTruthy();
    await waitForChatInputReEnabled(page, 300_000);
    const content = await getLastAssistantMessageProse(page);
    expect(content.length).toBeGreaterThan(10);
    // Citation pills use title="Reference N" (see messageRendering inlineCode)
    await expect(page.getByTitle(/^Reference \d+$/).first()).toBeVisible({ timeout: 30_000 });
  });
});
