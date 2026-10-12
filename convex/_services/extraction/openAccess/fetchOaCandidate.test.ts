import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOaCandidate, MAX_PDF_BYTES } from "./fetchOaCandidate";

const mockFetch = vi.fn();
const enc = new TextEncoder();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOaCandidate", () => {
  it("returns the bytes of a real PDF", async () => {
    mockFetch.mockResolvedValue(
      new Response(enc.encode("%PDF-1.7\n...body..."), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );
    const out = await fetchOaCandidate("https://arxiv.org/pdf/1304.1068");
    expect(out.type).toBe("pdf");
    if (out.type === "pdf")
      expect(new TextDecoder().decode(out.bytes)).toBe("%PDF-1.7\n...body...");
    expect(mockFetch.mock.calls[0][1].headers["User-Agent"]).toMatch(/^SolomindLM\/1\.0 \(mailto:/);
  });

  it("calls a .pdf URL that serves an HTML page html, not pdf", async () => {
    mockFetch.mockResolvedValue(
      new Response("<!DOCTYPE html><html><title>Article</title></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    const out = await fetchOaCandidate("https://www.nature.com/articles/nature12373.pdf");
    expect(out).toEqual({
      type: "html",
      finalUrl: "https://www.nature.com/articles/nature12373.pdf",
    });
  });

  it("sniffs HTML when the content type is missing", async () => {
    mockFetch.mockResolvedValue(new Response("  \n<html><body>x</body></html>", { status: 200 }));
    expect((await fetchOaCandidate("https://x.example/a")).type).toBe("html");
  });

  it("rejects other content as unusable", async () => {
    mockFetch.mockResolvedValue(
      new Response("PK\u0003\u0004zip", {
        status: 200,
        headers: { "content-type": "application/zip" },
      })
    );
    const out = await fetchOaCandidate("https://x.example/a.zip");
    expect(out).toMatchObject({ type: "unusable" });
  });

  it("rejects non-2xx responses", async () => {
    mockFetch.mockResolvedValue(new Response("Forbidden", { status: 403 }));
    expect(await fetchOaCandidate("https://europepmc.org/x")).toEqual({
      type: "unusable",
      reason: "HTTP 403",
    });
  });

  it("rejects a declared size over the cap without reading the body", async () => {
    mockFetch.mockResolvedValue(
      new Response(enc.encode("%PDF-1.7"), {
        status: 200,
        headers: { "content-length": String(MAX_PDF_BYTES + 1) },
      })
    );
    expect(await fetchOaCandidate("https://x.example/big.pdf")).toEqual({
      type: "unusable",
      reason: "too_large",
    });
  });

  it("stops reading a PDF that grows past the cap", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(enc.encode("%PDF-1.7"));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_PDF_BYTES) controller.close();
        else {
          controller.enqueue(sent === 0 ? chunk : new Uint8Array(1024 * 1024));
          sent += 1024 * 1024;
        }
      },
    });
    mockFetch.mockResolvedValue(new Response(body, { status: 200 }));
    expect(await fetchOaCandidate("https://x.example/huge.pdf")).toEqual({
      type: "unusable",
      reason: "too_large",
    });
  });

  it("reports network errors and timeouts as unusable instead of throwing", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNRESET"));
    expect(await fetchOaCandidate("https://x.example/a.pdf")).toEqual({
      type: "unusable",
      reason: "ECONNRESET",
    });
  });
});
