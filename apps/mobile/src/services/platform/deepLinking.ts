export type ParsedMobileDeepLink =
  | { kind: "notebook"; notebookId: string }
  | { kind: "shareFork"; token: string };

/**
 * Parse `/notebook/<id>` or `/share/fork/<token>` from universal links or custom scheme URLs.
 */
export function parseMobileDeepLink(url: string | null): ParsedMobileDeepLink | null {
  if (!url) return null;
  const fork = url.match(/\/share\/fork\/([^/?#]+)/);
  if (fork?.[1]) {
    return { kind: "shareFork", token: fork[1] };
  }
  const nb = url.match(/\/notebook\/([^/?#]+)/);
  if (nb?.[1]) {
    return { kind: "notebook", notebookId: nb[1] };
  }
  return null;
}
