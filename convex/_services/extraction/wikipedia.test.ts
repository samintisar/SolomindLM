import { describe, expect, it, vi } from "vitest";
import {
  readWikipediaArticle,
  wikipediaArticleForLink,
  wikipediaExtractToMarkdown,
} from "./wikipedia";

describe("wikipediaArticleForLink", () => {
  it.each([
    ["https://en.wikipedia.org/wiki/Monopoly", "https://en.wikipedia.org", "Monopoly"],
    ["https://en.m.wikipedia.org/wiki/Price_ceiling", "https://en.wikipedia.org", "Price ceiling"],
    ["http://de.wikipedia.org/wiki/Monopol", "https://de.wikipedia.org", "Monopol"],
    [
      "https://en.wikipedia.org/wiki/Federalist_No._10#Background",
      "https://en.wikipedia.org",
      "Federalist No. 10",
    ],
    ["https://en.wikipedia.org/wiki/Caf%C3%A9_au_lait", "https://en.wikipedia.org", "Café au lait"],
    [
      "https://en.wikipedia.org/w/index.php?title=Spacing_effect",
      "https://en.wikipedia.org",
      "Spacing effect",
    ],
    ["https://zh-yue.wikipedia.org/wiki/X", "https://zh-yue.wikipedia.org", "X"],
  ])("%s", (link, origin, title) => {
    expect(wikipediaArticleForLink(link)).toEqual({ origin, title });
  });

  it.each([
    "https://en.wikipedia.org/w/index.php?title=Monopoly&oldid=123",
    "https://en.wikipedia.org/w/index.php?title=Monopoly&diff=123",
    "https://en.wikipedia.org/",
    "https://en.wikipedia.org/wiki/",
    "https://wikipedia.org/wiki/Monopoly",
    "https://en.wikipedia.org.evil.example/wiki/Monopoly",
    "https://en.wiktionary.org/wiki/monopoly",
    "ftp://en.wikipedia.org/wiki/Monopoly",
    "not a url",
  ])("leaves %s to the scraper", (link) => {
    expect(wikipediaArticleForLink(link)).toBeUndefined();
  });
});

describe("wikipediaExtractToMarkdown: inline-style formulas", () => {
  it("handles the {\\textstyle …} annotation like {\\displaystyle …}", () => {
    const extract = [
      "The rate ",
      "  ",
      "    ",
      "      η",
      "    ",
      "    {\\textstyle \\eta }",
      "  ",
      " is small.",
    ].join("\n");

    expect(wikipediaExtractToMarkdown(extract)).toBe("The rate $\\eta$ is small.");
  });
});

describe("wikipediaExtractToMarkdown", () => {
  it("turns section markers into headings and drops link and reference sections", () => {
    const extract = [
      "Lead paragraph.",
      "",
      "",
      "== History ==",
      "Body.",
      "",
      "=== Early ===",
      "Sub body.",
      "",
      "",
      "== See also ==",
      "Oligopoly",
      "",
      "",
      "== References ==",
      "Smith (2001).",
      "",
      "=== Sources ===",
      "Jones.",
      "",
      "",
      "== Further reading ==",
      "A book",
    ].join("\n");

    expect(wikipediaExtractToMarkdown(extract)).toBe(
      "Lead paragraph.\n\n## History\n\nBody.\n\n### Early\n\nSub body."
    );
  });

  it("keeps a prose section that follows a dropped one", () => {
    const extract = "Lead.\n\n== Notes ==\nnote 1\n\n== Legacy ==\nStill here.";

    expect(wikipediaExtractToMarkdown(extract)).toBe("Lead.\n\n## Legacy\n\nStill here.");
  });

  it("replaces rendered formulas with inline LaTeX and keeps the prose around them", () => {
    // TextExtracts output: MathML tokens on indented lines, then the {\displaystyle} line.
    const extract = [
      "Formally, the function ",
      "  ",
      "    ",
      "      ",
      "        σ",
      "      ",
      "    ",
      "    {\\displaystyle \\sigma }",
      "  ",
      "⁠, where ",
      "  ",
      "    ",
      "      K",
      "      >",
      "      1",
      "    ",
      "    {\\displaystyle K>1}",
      "  ",
      " and computes the output.",
      "",
      "Next paragraph.",
    ].join("\n");

    expect(wikipediaExtractToMarkdown(extract)).toBe(
      "Formally, the function $\\sigma$, where $K>1$ and computes the output.\n\nNext paragraph."
    );
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function options(fetchImpl: unknown, sleep = vi.fn(async () => undefined)) {
  return {
    userAgent: "SolomindLM/1.0 (mailto:test@example.com)",
    fetchImpl: fetchImpl as typeof fetch,
    sleep,
  };
}

describe("readWikipediaArticle", () => {
  it("reads the article from the language's Action API with a User-Agent", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({
        query: { pages: [{ title: "Monopol", extract: "Text.\n\n== Literatur ==\nBuch" }] },
      })
    );

    const article = await readWikipediaArticle(
      "https://de.wikipedia.org/wiki/Monopol",
      options(fetchImpl)
    );

    expect(article).toEqual({ title: "Monopol", content: "Text.\n\n## Literatur\n\nBuch" });
    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://de.wikipedia.org/w/api.php");
    expect(parsed.searchParams.get("titles")).toBe("Monopol");
    expect(parsed.searchParams.get("prop")).toBe("extracts");
    expect(parsed.searchParams.get("explaintext")).toBe("1");
    expect(parsed.searchParams.get("redirects")).toBe("1");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^SolomindLM\//);
  });

  it("returns undefined for links that aren't Wikipedia articles, without fetching", async () => {
    const fetchImpl = vi.fn();

    const article = await readWikipediaArticle(
      "https://example.org/wiki/Monopoly",
      options(fetchImpl)
    );

    expect(article).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing page", () => jsonResponse({ query: { pages: [{ title: "Zz", missing: true }] } })],
    ["an empty extract", () => jsonResponse({ query: { pages: [{ title: "Zz", extract: "" }] } })],
    ["an HTTP error", () => new Response("oops", { status: 503 })],
    ["a malformed body", () => new Response("<html>", { status: 200 })],
  ])("returns undefined for %s", async (_name, response) => {
    const fetchImpl = vi.fn(async () => response());

    const article = await readWikipediaArticle(
      "https://en.wikipedia.org/wiki/Zz",
      options(fetchImpl)
    );

    expect(article).toBeUndefined();
  });

  it("returns undefined when the request throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const article = await readWikipediaArticle(
      "https://en.wikipedia.org/wiki/Zz",
      options(fetchImpl)
    );

    expect(article).toBeUndefined();
  });

  it("waits once on a 429 and retries", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(
        jsonResponse({ query: { pages: [{ title: "A", extract: "Body." }] } })
      );

    const article = await readWikipediaArticle(
      "https://en.wikipedia.org/wiki/A",
      options(fetchImpl, sleep)
    );

    expect(article).toEqual({ title: "A", content: "Body." });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up on a 429 that asks for a long wait", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 429, headers: { "retry-after": "120" } })
    );

    const article = await readWikipediaArticle(
      "https://en.wikipedia.org/wiki/A",
      options(fetchImpl)
    );

    expect(article).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
