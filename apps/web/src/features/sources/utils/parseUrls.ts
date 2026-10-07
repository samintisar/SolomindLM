/** Split pasted text on whitespace and keep the http(s) URLs. */
export function parseUrls(input: string): string[] {
  return input
    .split(/\s+/)
    .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
}
