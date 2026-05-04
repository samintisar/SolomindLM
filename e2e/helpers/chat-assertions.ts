import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Matches `ChatInput` placeholder in default vs deep-research mode */
export const CHAT_TEXTAREA_PLACEHOLDER =
  /Ask a question about your sources|Ask a complex research question with multi-step investigation/;

/**
 * Open the Research Options dropdown menu ("+" button) in the chat input area.
 * The menu contains "Deep Research" toggle and source filter checkboxes.
 */
export async function openResearchOptionsMenu(page: Page) {
  const menuBtn = page.locator('button[title="Research options"]');
  await menuBtn.click();
  // Wait for dropdown to render — "Deep Research" text is always present
  await expect(page.getByText("Deep Research")).toBeVisible({ timeout: 5_000 });
}

/**
 * Dismiss the Research Options dropup. `ChatInput` does not close it on Escape
 * (only outside mousedown); toggle the "+" control instead.
 */
export async function closeResearchOptionsMenu(page: Page) {
  await page.locator('button[title="Research options"]').click();
  await expect(page.getByRole("button", { name: "Deep Research", exact: true })).toBeHidden({
    timeout: 5_000,
  });
}

/**
 * Switch to Web-only source filter: opens the Research Options menu,
 * enables "Web" and disables "Notebook sources" so chat queries go to
 * web search instead of requiring notebook sources.
 */
export async function enableWebOnlyFilter(page: Page) {
  await openResearchOptionsMenu(page);

  // Enable "Web" filter (adds to active list)
  const webLabel = page.locator("label").filter({ hasText: /^Web$/ });
  await webLabel.click();

  // Disable "Notebook sources" filter (must have ≥1 active, so Web is added first)
  const notebookLabel = page.locator("label").filter({ hasText: /^Notebook sources$/ });
  await notebookLabel.click();

  await closeResearchOptionsMenu(page);
}

/**
 * Send a chat message: fill the input and click the Send button.
 * Works for both normal mode (title="Send message (Enter)") and
 * deep research mode (title="Start deep research (Enter)").
 */
export async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(CHAT_TEXTAREA_PLACEHOLDER);
  await input.fill(text);
  // The send button title varies: "Send message (Enter)" or "Start deep research (Enter)"
  const send = page.locator('button[title*="(Enter)"]');
  await send.click();
}

/**
 * Switch the source filter in chat input area by name.
 * Opens the Research Options menu and toggles the named filter.
 * Filter names: "Notebook sources", "Web", "News", "Finance"
 */
export async function switchSourceFilter(page: Page, filterName: string) {
  await openResearchOptionsMenu(page);
  const filterLabel = page.locator("label").filter({ hasText: new RegExp(`^${filterName}$`) });
  await filterLabel.click();
  await closeResearchOptionsMenu(page);
}

/**
 * Wait for any assistant message to appear.
 * Assistant messages have `data-message-id` and use `items-start` alignment.
 */
/**
 * Resolves when the chat textarea is interactive again after send/streaming.
 * Mirrors `chatInputDisabled` in ChatPanel (isSending || isLoading || remoteGenerationBlocksSend).
 */
export async function waitForChatInputReEnabled(page: Page, timeoutMs = 120_000) {
  const input = page.getByPlaceholder(CHAT_TEXTAREA_PLACEHOLDER);
  await expect(input).not.toBeDisabled({ timeout: timeoutMs });
}

/** Final prose text of the last assistant bubble (for assertions after streaming finished). */
export async function getLastAssistantMessageProse(page: Page): Promise<string> {
  return page.evaluate(() => {
    const els = document.querySelectorAll("[data-message-id]");
    const assistantEls = Array.from(els).filter((el) => el.classList.contains("items-start"));
    if (assistantEls.length === 0) return "";
    const root = assistantEls[assistantEls.length - 1];
    const prose = root.querySelector(".prose.max-w-none");
    if (prose) return (prose.textContent || "").trim();
    return (root.textContent || "").trim();
  });
}

export async function waitForAssistantMessage(page: Page, timeout = 15_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const els = document.querySelectorAll("[data-message-id]");
        return Array.from(els).some((el) => el.classList.contains("items-start"));
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for chat streaming to complete by polling content stabilization.
 * Returns the final text content of the last assistant message body (markdown prose only).
 * Uses `.prose.max-w-none` inside the assistant row so AgentActivityPanel / tool traces
 * do not keep `textContent` changing after the model has finished.
 */
export async function waitForStreamingComplete(page: Page, timeoutMs = 30_000): Promise<string> {
  const startTime = Date.now();
  let lastContent = "";
  let stableCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    const content = await page.evaluate(() => {
      const els = document.querySelectorAll("[data-message-id]");
      const assistantEls = Array.from(els).filter((el) => el.classList.contains("items-start"));
      if (assistantEls.length === 0) return "";
      const root = assistantEls[assistantEls.length - 1];
      const prose = root.querySelector(".prose.max-w-none");
      if (prose) return (prose.textContent || "").trim();
      return (root.textContent || "").trim();
    });

    // Short answers (e.g. "4" for 2+2) must count as stable, not only length > 10
    if (content && content === lastContent && content.length > 0) {
      stableCount++;
      if (stableCount >= 5) {
        return content;
      }
    } else {
      stableCount = 0;
    }

    lastContent = content;
    await page.waitForTimeout(500);
  }

  throw new Error(`Chat streaming did not complete within ${timeoutMs}ms`);
}

/**
 * Assert that a user message with the given text is visible in the chat.
 */
export async function expectUserMessage(page: Page, text: string) {
  await expect(page.getByText(text)).toBeVisible();
}
