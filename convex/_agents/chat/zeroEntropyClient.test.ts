import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createZeroEntropyClient } from "./zeroEntropyClient";

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

/** Local stand-in for ZeroEntropy during an outage: 503 with Retry-After of one day. */
async function startUnavailableServer(): Promise<{ baseURL: string; requests: () => number }> {
  let count = 0;
  server = createServer((_req, res) => {
    count++;
    res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "86400" });
    res.end(JSON.stringify({ detail: "ZeroEntropy inference is unavailable." }));
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseURL: `http://127.0.0.1:${port}`, requests: () => count };
}

describe("createZeroEntropyClient", () => {
  it("fails fast on a 503 instead of honouring a one-day Retry-After", async () => {
    const { baseURL, requests } = await startUnavailableServer();
    const client = await createZeroEntropyClient("test-key", { baseURL });

    const start = Date.now();
    await expect(
      client.models.rerank({ model: "zerank-2", query: "q", documents: ["a", "b"] })
    ).rejects.toThrow(/503/);

    expect(Date.now() - start).toBeLessThan(2_000);
    expect(requests()).toBe(1);
  });
});
