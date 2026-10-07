/** How long the object URL outlives the click: WebKit starts the download after `click()` returns. */
const REVOKE_DELAY_MS = 1000;

/** Saves `blob` as `fileName` through a temporary link (in the DOM, which Firefox needs). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
