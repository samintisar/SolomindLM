const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Where Google/Apple sign-in should land. On a local dev server this is the absolute
 * origin, so a worktree's own port gets the user back (auth tokens are per-origin
 * localStorage); dev deployments accept any localhost port. Elsewhere it stays
 * relative and the server resolves it against `SITE_URL`.
 */
export function oauthRedirectTo(location: Pick<Location, "hostname" | "origin">): string {
  return LOCALHOST_HOSTNAMES.has(location.hostname) ? `${location.origin}/home` : "/home";
}
