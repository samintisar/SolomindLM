import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Matches `ChatInput` placeholder in default vs deep-research mode */
export const CHAT_TEXTAREA_PLACEHOLDER =
  /Ask a question about your sources|Ask a complex research question with multi-step investigation/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Open the composer mode dropdown (trigger: "Composer mode: <Label>"). */
export async function openComposerModeMenu(page: Page) {
  await page.getByRole("button", { name: /^Composer mode:/ }).click();
}

/**
 * Switch the composer mode ("Chat", "Deep Research", "Literature Review").
 * Items are menuitemradios whose accessible name may gain a description, so match the start only.
 */
export async function selectComposerMode(page: Page, label: string) {
  await openComposerModeMenu(page);
  await page.getByRole("menuitemradio", { name: new RegExp(`^${escapeRegExp(label)}`) }).click();
}

/** Open the Filters popover (source channel checkboxes). */
export async function openFiltersPopover(page: Page) {
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeVisible({ timeout: 5_000 });
}

/**
 * Toggle one source channel checkbox in the Filters popover.
 * Channel names: "Notebook sources", "Academic", "Web", "News", "Finance".
 * The popover is left open; call `closeFiltersPopover` when done.
 */
export async function toggleSourceChannel(page: Page, name: string) {
  await page.getByRole("checkbox", { name }).click();
}

/** Assert a source channel checkbox is checked / unchecked (Filters popover must be open). */
export async function expectChannelChecked(page: Page, name: string, checked: boolean) {
  const checkbox = page.getByRole("checkbox", { name });
  if (checked) await expect(checkbox).toBeChecked();
  else await expect(checkbox).not.toBeChecked();
}

/** Dismiss the Filters popover with Escape (Radix closes it and restores focus to the trigger). */
export async function closeFiltersPopover(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("checkbox").first()).toBeHidden({ timeout: 5_000 });
}

/** Make a source channel checkbox match `checked`, clicking only when it differs. */
async function setSourceChannel(page: Page, name: string, checked: boolean) {
  const checkbox = page.getByRole("checkbox", { name });
  if ((await checkbox.isChecked()) !== checked) await checkbox.click();
  await expectChannelChecked(page, name, checked);
}

/**
 * Switch to Web-only source filter so chat queries go to web search instead of requiring
 * notebook sources. Idempotent: works from Chat mode (Notebook only) and from Deep Research
 * mode (Notebook, Web and Academic). Web is enabled first because at least one channel must
 * stay on. In Deep Research, pick the mode before calling this: entering the mode re-adds the
 * default channels.
 */
export async function enableWebOnlyFilter(page: Page) {
  await openFiltersPopover(page);
  await setSourceChannel(page, "Web", true);
  for (const name of ["Notebook sources", "Academic", "News", "Finance"]) {
    await setSourceChannel(page, name, false);
  }
  await closeFiltersPopover(page);
}

/**
 * Send a chat message: fill the input and click the Send button.
 * The send button title varies by mode but always contains "(Enter)".
 */
export async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(CHAT_TEXTAREA_PLACEHOLDER);
  await input.fill(text);
  const send = page.locator('button[title*="(Enter)"]');
  await send.click();
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
