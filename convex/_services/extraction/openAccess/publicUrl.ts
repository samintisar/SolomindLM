/**
 * Destination policy for open-access downloads (#480). Candidate URLs come from Unpaywall, OpenAlex
 * and the paper record (which a client can set), so the server only fetches public http(s) hosts:
 * no loopback, private, link-local (cloud metadata), CGNAT, multicast or internal-only names.
 * Checked before the first request and before every redirect. Literal addresses only; a public name
 * that resolves to a private address isn't caught here.
 */

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const octets = parts.map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function isBlockedIpv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  // IPv4-mapped (::ffff:a.b.c.d, which the URL parser writes as ::ffff:xxxx:xxxx).
  const mapped = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const hi = Number.parseInt(mapped[1], 16);
    const lo = Number.parseInt(mapped[2], 16);
    return isBlockedIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  if (h.startsWith("::ffff:")) return true;
  return /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("ff");
}

/** Whether the server may fetch this URL. */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) return !isBlockedIpv6(host.slice(1, -1));
  const octets = ipv4Octets(host);
  if (octets) return !isBlockedIpv4(octets);
  if (!host.includes(".") || host === "localhost") return false;
  return !BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
