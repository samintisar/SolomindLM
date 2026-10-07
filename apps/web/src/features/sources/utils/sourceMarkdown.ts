/** Copy a source's markdown to the clipboard. Rethrows so the caller can report the failure. */
export async function copySourceMarkdown(markdown: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(markdown);
  } catch (err) {
    console.error("Copy failed:", err);
    throw err;
  }
}

/** Download a source's markdown as `<title>.md`. */
export function downloadSourceMarkdown(markdown: string, title: string): void {
  const safeName = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "source";
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
