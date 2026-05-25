import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Matches `ChatInput` placeholder across composer modes */
export const CHAT_TEXTAREA_PLACEHOLDER =
  /Ask a question about your sources|Ask a complex research question with multi-step investigation|Describe the topic, research question, and requirements to generate a literature review/;

/**
 * Open the source Filters dropdown in the chat input (channel checkboxes).
 */
export async function openSourceFiltersMenu(page: Page) {
  await page.getByRole("button", { name: "Source filters" }).click();
  await expect(page.getByText("Sources").first()).toBeVisible({ timeout: 5_000 });
}

/**
 * Close the source Filters dropdown.
 */
export async function closeSourceFiltersMenu(page: Page) {
  await page.getByRole("button", { name: "Source filters" }).click();
  await expect(page.getByRole("button", { name: "Source filters" })).toHaveAttribute(
    "aria-expanded",
    "false",
    {
      timeout: 5_000,
    }
  );
}

/** @deprecated Use openSourceFiltersMenu */
export const openResearchOptionsMenu = openSourceFiltersMenu;

/** @deprecated Use closeSourceFiltersMenu */
export const closeResearchOptionsMenu = closeSourceFiltersMenu;

/**
 * Open the composer mode menu (Chat / Deep Research / Literature Review).
 */
export async function openComposerModeMenu(page: Page) {
  await page.getByRole("button", { name: /^Composer mode:/ }).click();
  await expect(page.getByRole("option", { name: "Deep Research", exact: true })).toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Switch to Web-only source filter: opens Filters, enables "Web" and disables "Notebook sources".
 */
export async function enableWebOnlyFilter(page: Page) {
  await openSourceFiltersMenu(page);

  const webLabel = page.locator("label").filter({ hasText: /^Web$/ });
  await webLabel.click();

  const notebookLabel = page.locator("label").filter({ hasText: /^Notebook sources$/ });
  await notebookLabel.click();

  await closeSourceFiltersMenu(page);
}

/**
 * Send a chat message: fill the input and click the Send button.
 */
export async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(CHAT_TEXTAREA_PLACEHOLDER);
  await input.fill(text);
  const send = page.locator('button[title*="(Enter)"]');
  await send.click();
}

/**
 * Switch the source filter in chat input area by name.
 */
export async function switchSourceFilter(page: Page, filterName: string) {
  await openSourceFiltersMenu(page);
  const filterLabel = page.locator("label").filter({ hasText: new RegExp(`^${filterName}$`) });
  await filterLabel.click();
  await closeSourceFiltersMenu(page);
}

/**
 * Resolves when the chat textarea is interactive again after send/streaming.
 */
export async function waitForChatInputReEnabled(page: Page, timeoutMs = 120_000) {
  const input = page.getByPlaceholder(CHAT_TEXTAREA_PLACEHOLDER);
  await expect(input).not.toBeDisabled({ timeout: timeoutMs });
}

/** Final prose text of the last assistant bubble */
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

export async function expectUserMessage(page: Page, text: string) {
  await expect(page.getByText(text)).toBeVisible();
}
