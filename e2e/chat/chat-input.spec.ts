import { expect, test } from "../fixtures/notebook.fixture";
import {
  closeFiltersPopover,
  expectChannelChecked,
  openFiltersPopover,
  selectComposerMode,
  toggleSourceChannel,
} from "../helpers/chat-assertions";

test.describe("Chat Input", () => {
  test("source filter can switch to Web", async ({ notebookPage }) => {
    const page = notebookPage;

    await openFiltersPopover(page);

    // Chat mode starts on Notebook sources only
    await expectChannelChecked(page, "Notebook sources", true);
    await expectChannelChecked(page, "Web", false);

    await toggleSourceChannel(page, "Web");
    await expectChannelChecked(page, "Web", true);

    await closeFiltersPopover(page);
  });

  test("deep research can be selected from the composer mode menu", async ({ notebookPage }) => {
    const page = notebookPage;

    // Default mode is Chat
    await expect(page.getByRole("button", { name: "Composer mode: Chat" })).toBeVisible();

    await selectComposerMode(page, "Deep Research");

    // The mode trigger reflects the new mode
    await expect(page.getByRole("button", { name: "Composer mode: Deep Research" })).toBeVisible();

    // Placeholder should change to research-specific text
    await expect(page.getByPlaceholder(/Ask a complex research question/)).toBeVisible();
  });

  test("chat input shows correct placeholder", async ({ notebookPage }) => {
    const page = notebookPage;

    // Default placeholder when in Chat mode
    await expect(page.getByPlaceholder(/Ask a question about your sources/)).toBeVisible();
  });
});
