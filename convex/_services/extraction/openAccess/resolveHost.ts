"use node";
/** Node DNS for the open-access destination check (`fetchOaCandidate`'s `resolveHost`). */

import { lookup } from "node:dns/promises";

/** Every address (IPv4 and IPv6) the hostname resolves to. */
export async function resolveHostAddresses(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}
