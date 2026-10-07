// convex/freeTools/clientIp.ts
/**
 * Caller identity for anonymous rate limiting. Only the salted hash is ever stored (as a
 * rate-limiter key) — never log or persist the raw address.
 */

function forwardedForEntries(headers: Headers): string[] {
  return (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The last `x-forwarded-for` entry: whether the edge appends to a client-supplied header or
 * overwrites it, the last entry is the one the edge itself saw.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const entries = forwardedForEntries(headers);
  if (entries.length > 0) return entries[entries.length - 1];
  return headers.get("x-real-ip")?.trim() || null;
}

/** Number of x-forwarded-for entries — logged (not the values) to confirm the edge's behaviour. */
export function forwardedForHopCount(headers: Headers): number {
  return forwardedForEntries(headers).length;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Expand one side of an IPv6 `::` into lowercase hextets without leading zeros, or null if invalid. */
function parseHextets(part: string, allowTrailingIpv4: boolean): string[] | null {
  if (part === "") return [];
  const groups = part.split(":");
  const out: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.includes(".")) {
      if (!allowTrailingIpv4 || i !== groups.length - 1 || !IPV4.test(group)) return null;
      const octets = group.split(".").map(Number);
      if (octets.some((octet) => octet > 255)) return null;
      out.push(
        ((octets[0] << 8) | octets[1]).toString(16),
        ((octets[2] << 8) | octets[3]).toString(16)
      );
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      out.push(group.toLowerCase().replace(/^0+(?=.)/, ""));
    }
  }
  return out;
}

/** `2001:db8:abcd:12::/64`-style prefix for an IPv6 address, or null when it does not parse. */
function ipv6Prefix64(address: string): string | null {
  const addr = address.split("%")[0]; // drop a zone id
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const compressed = halves.length === 2;
  const head = parseHextets(halves[0], !compressed);
  const tail = compressed ? parseHextets(halves[1], true) : [];
  if (!head || !tail) return null;
  let groups: string[];
  if (compressed) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/**
 * Canonical rate-limit identity for a client address. A single user controls a whole IPv6 /64, so
 * IPv6 collapses to its /64; IPv4-mapped IPv6 and ports are unwrapped; unparseable input is
 * returned trimmed.
 */
export function normalizeClientIp(ip: string): string {
  const trimmed = ip.trim();
  let value = trimmed;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) value = bracketed[1];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped) value = mapped[1];
  const ipv4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/.exec(value);
  if (ipv4) return ipv4[1];
  if (value.includes(":")) return ipv6Prefix64(value) ?? trimmed;
  return trimmed;
}

export async function hashClientIp(ip: string, salt: string): Promise<string> {
  const identity = normalizeClientIp(ip);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${identity}`)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
