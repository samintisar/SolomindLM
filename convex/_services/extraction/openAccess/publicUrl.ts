/**
 * Destination policy for open-access downloads (#480). Candidate URLs come from Unpaywall, OpenAlex
 * and the paper record (which a client can set), so the server only fetches public http(s) hosts:
 * no loopback, private, link-local (cloud metadata), CGNAT, multicast or internal-only names.
 * Checked before the first request and before every redirect, on the URL and (when the caller can
 * resolve names) on every address the hostname resolves to.
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

/** The eight 16-bit groups of an IPv6 address (a dotted IPv4 tail allowed), or null. */
function ipv6Groups(host: string): number[] | null {
  let h = host.toLowerCase().split("%")[0];
  const tail = h.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const o = ipv4Octets(tail[1]);
    if (!o) return null;
    h = `${h.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s ? s.split(":") : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => Number.parseInt(g, 16));
}

const embeddedIpv4 = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

function isBlockedIpv6(host: string): boolean {
  const g = ipv6Groups(host);
  if (!g) return true;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d, which covers :: and ::1).
  if (zeros(0, 5) && (g[5] === 0xffff || g[5] === 0))
    return isBlockedIpv4(embeddedIpv4(g[6], g[7]));
  // NAT64 (64:ff9b::/96) carries an IPv4 address; the local-use prefix 64:ff9b:1::/48 is private.
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    return zeros(2, 6) ? isBlockedIpv4(embeddedIpv4(g[6], g[7])) : g[2] === 1;
  }
  // 6to4 (2002::/16) carries an IPv4 address in its second and third groups.
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedIpv4(g[1], g[2]));
  // Unique local fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast ff00::/8.
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) >= 0xfe80 || (g[0] & 0xff00) === 0xff00;
}

/** Whether a literal IP address (as DNS returns it) is one the server must not connect to. */
export function isBlockedIpAddress(address: string): boolean {
  const octets = ipv4Octets(address);
  return octets ? isBlockedIpv4(octets) : isBlockedIpv6(address);
}

/** The URL's hostname when it is a DNS name (not an IP literal) and so needs resolving. */
export function hostNeedingResolution(raw: string): string | null {
  const host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
  return host.startsWith("[") || ipv4Octets(host) ? null : host;
}

/** Whether the server may fetch this URL, judged from the URL alone. */
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
