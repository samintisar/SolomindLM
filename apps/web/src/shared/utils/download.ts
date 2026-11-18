/** Save `content` as a file named `filename`, through a temporary object URL. */
export function downloadFile(content: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Some browsers only follow a click on an anchor that is in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * A download name from `title`: the characters file systems reject become `replacement`, and
 * `fallback` stands in when nothing is left.
 */
export function safeFileName(title: string, fallback: string, replacement = "_"): string {
  return title.replace(/[\\/:*?"<>|]/g, replacement).trim() || fallback;
}
