import { Message } from "@/shared/types/index";
import { downloadBlob } from "@/shared/utils/downloadFile";

/**
 * Convert chat messages to clean markdown format
 */
function messagesToMarkdown(messages: Message[]): string {
  if (messages.length === 0) return "";

  let markdown = "";

  for (const message of messages) {
    if (message.role === "user") {
      markdown += `## You\n\n${(message.content ?? "").trim()}\n\n`;
    } else if (message.role === "assistant") {
      markdown += `## Assistant\n\n${(message.content ?? "").trim()}\n\n`;
      markdown += `---\n\n`;
    }
  }

  return markdown.trim();
}

/**
 * Export chat messages as a formatted Markdown file.
 *
 * @param messages - Array of chat messages to export
 * @param notebookTitle - Title of the notebook for the header
 * @param timestamp - Optional timestamp string (defaults to current date)
 */
export function exportAsMarkdown(
  messages: Message[],
  notebookTitle: string,
  timestamp?: string
): void {
  if (messages.length === 0) {
    return;
  }

  const dateStr = timestamp || new Date().toLocaleString();
  const safeTitle = notebookTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "chat";
  const filename = `chat_${safeTitle}_${new Date().toISOString().split("T")[0]}.md`;

  // Build markdown content with header
  let markdown = `# Chat Export - ${notebookTitle}\n`;
  markdown += `**Date:** ${dateStr}\n`;
  markdown += `**Notebook:** ${notebookTitle}\n`;
  markdown += `\n---\n\n`;

  // Add messages using the same clean formatting
  markdown += messagesToMarkdown(messages);

  // Create and trigger download
  downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), filename);
}
