import { test, expect } from "../fixtures/notebook.fixture";
import { openStudioTool } from "../helpers/studio-assertions";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 90_000 });

test.describe("Prompt Library", () => {
  test.describe("Save as Prompt Modal", () => {
    test("opens Save as Prompt modal from Customize Flashcards", async ({ notebookPage }) => {
      const page = notebookPage;

      // Open the Flashcards studio tool
      await openStudioTool(page, "Flashcards");

      // Wait for the Customize Flashcards modal
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      // Find the Area of Focus textarea and enter text
      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await expect(topicTextarea).toBeVisible();
      await topicTextarea.fill("Focus on key concepts for exam prep");

      // The "Save as reusable prompt" button should be enabled
      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await expect(saveAsPromptButton).toBeEnabled();

      // Click to open Save as Prompt modal
      await saveAsPromptButton.click();

      // Save as Prompt modal should open
      await expect(page.getByRole("heading", { name: /save as prompt/i })).toBeVisible();
      // Should show the tool label in the header
      await expect(page.getByTestId("save-as-prompt-tool-label")).toHaveText("Flashcards");

      // The prompt text should be pre-filled with the topic text
      const promptTextarea = page.getByPlaceholder(/Enter your custom prompt/);
      await expect(promptTextarea).toHaveValue("Focus on key concepts for exam prep");

      // Character counter exists in the document
      await expect(page.locator("body")).toContainText("/2000");
    });

    test("shows disabled Save button when title is empty", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await topicTextarea.fill("Test prompt text");

      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await saveAsPromptButton.click();

      // Save as Prompt modal should open
      await expect(page.getByRole("heading", { name: /save as prompt/i })).toBeVisible();

      // Save button should be disabled without a title
      const savePromptButton = page.getByRole("button", { name: /save prompt/i });
      await expect(savePromptButton).toBeDisabled();
    });

    test("enables Save button when title is entered", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await topicTextarea.fill("Test prompt text");

      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await saveAsPromptButton.click();

      await expect(page.getByRole("heading", { name: /save as prompt/i })).toBeVisible();

      // Initially disabled (no title)
      const savePromptButton = page.getByRole("button", { name: /save prompt/i });
      await expect(savePromptButton).toBeDisabled();

      // Enter a title using the correct placeholder
      const titleInput = page.getByPlaceholder(/for exam prep/);
      await titleInput.fill("My Test Prompt");

      // Now the Save button should be enabled
      await expect(savePromptButton).toBeEnabled();
    });

    test("toggles between private and public visibility", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await topicTextarea.fill("Test prompt text");

      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await saveAsPromptButton.click();

      await expect(page.getByRole("heading", { name: /save as prompt/i })).toBeVisible();

      // Initially shows private state
      await expect(page.getByText("Private")).toBeVisible();
      await expect(page.getByText(/Only you can see and use this prompt/)).toBeVisible();

      // Click the visibility toggle (testid + role=switch)
      const toggleButton = page.getByTestId("save-as-prompt-visibility-toggle");
      await expect(toggleButton).toHaveAttribute("aria-checked", "false");
      await toggleButton.click();
      await expect(toggleButton).toHaveAttribute("aria-checked", "true");

      // Should now show public state
      await expect(page.getByText("Public")).toBeVisible();
      await expect(page.getByText(/Anyone can discover and use this prompt/)).toBeVisible();

      // Public hint should appear
      await expect(
        page.getByText(/Your prompt will be visible in the public library/)
      ).toBeVisible();
    });

    test("closes modal when Cancel is clicked", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await topicTextarea.fill("Test prompt text");

      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await saveAsPromptButton.click();

      await expect(page.getByRole("heading", { name: /save as prompt/i })).toBeVisible();

      // Click Cancel
      await page.getByRole("button", { name: "Cancel" }).click();

      // Modal should close
      await expect(page.getByRole("heading", { name: /save as prompt/i })).not.toBeVisible();

      // Customize Flashcards modal should still be open
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible();
    });

    test("closes modal when X button is clicked", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await topicTextarea.fill("Test prompt text");

      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await saveAsPromptButton.click();

      await expect(page.getByRole("heading", { name: /save as prompt/i })).toBeVisible();

      // Click the X (close) button in the Save as Prompt modal
      await page.getByTestId("save-as-prompt-close").click();

      // Modal should close
      await expect(page.getByRole("heading", { name: /save as prompt/i })).not.toBeVisible();
    });
  });

  test.describe("Discover Prompts Modal", () => {
    test("opens from Customize modal via Discover Prompts button", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      // Click "Discover Prompts" button
      const discoverPromptsButton = page.getByRole("button", { name: /discover prompts/i });
      await discoverPromptsButton.click();

      // Discover Prompts modal should open
      await expect(page.getByRole("heading", { name: /prompt library/i })).toBeVisible();
      await expect(page.getByText(/Flashcards/)).toBeVisible();

      // Should have Public and My Prompts tabs
      await expect(page.getByRole("button", { name: /public/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /my prompts/i })).toBeVisible();
    });

    test("shows search and sort options in Public tab", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      const discoverPromptsButton = page.getByRole("button", { name: /discover prompts/i });
      await discoverPromptsButton.click();

      await expect(page.getByRole("heading", { name: /prompt library/i })).toBeVisible();

      // Click Public tab
      await page.getByRole("button", { name: /public/i }).click();

      // Should show search input
      await expect(page.getByPlaceholder(/search prompts/i)).toBeVisible();

      // Should show sort dropdown
      await expect(page.getByText(/most saved/i)).toBeVisible();
    });

    test("switches between Public and My Prompts tabs", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      const discoverPromptsButton = page.getByRole("button", { name: /discover prompts/i });
      await discoverPromptsButton.click();

      await expect(page.getByRole("heading", { name: /prompt library/i })).toBeVisible();

      // Click My Prompts tab
      const myPromptsTab = page.getByTestId("discover-prompts-tab-my");
      await myPromptsTab.click();

      // My Prompts should be active (assert via aria-selected, not Tailwind classes)
      await expect(myPromptsTab).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("discover-prompts-tab-public")).toHaveAttribute(
        "aria-selected",
        "false"
      );

      // Search/sort should not be visible in My Prompts
      await expect(page.getByPlaceholder(/search prompts/i)).not.toBeVisible();
    });
  });

  test.describe("Save as Prompt button disabled state", () => {
    test("Save as Prompt button is disabled when topic is empty", async ({ notebookPage }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      // Topic is empty by default
      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      await expect(topicTextarea).toHaveValue("");

      // "Save as reusable prompt" button should be disabled
      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });
      await expect(saveAsPromptButton).toBeDisabled();
    });

    test("Save as Prompt button becomes enabled when topic is entered", async ({
      notebookPage,
    }) => {
      const page = notebookPage;

      await openStudioTool(page, "Flashcards");
      await expect(page.getByRole("heading", { name: /customize flashcards/i })).toBeVisible({
        timeout: 15_000,
      });

      const topicTextarea = page.getByPlaceholder(/e\.g\. Focus on 'Relational Algebra'/);
      const saveAsPromptButton = page.getByRole("button", { name: /save as reusable prompt/i });

      // Initially disabled
      await expect(saveAsPromptButton).toBeDisabled();

      // Type in the textarea
      await topicTextarea.fill("Some topic text");

      // Button should now be enabled
      await expect(saveAsPromptButton).toBeEnabled();
    });
  });
});
