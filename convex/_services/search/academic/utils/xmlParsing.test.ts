import { describe, it, expect } from "vitest";
import {
  extractTag,
  extractAllTags,
  stripXmlTags,
  extractAttribute,
  extractXmlBlocks,
} from "./xmlParsing";

describe("xmlParsing", () => {
  describe("extractTag", () => {
    it("extracts text from simple XML tag", () => {
      const xml = "<title>Test Title</title>";
      expect(extractTag(xml, "title")).toBe("Test Title");
    });

    it("handles tags with attributes", () => {
      const xml = '<article-id pub-id-type="doi">10.1234/test</article-id>';
      expect(extractTag(xml, "article-id")).toBe("10.1234/test");
    });

    it("returns undefined for missing tag", () => {
      expect(extractTag("<root></root>", "missing")).toBeUndefined();
    });

    it("trims whitespace", () => {
      expect(extractTag("  <title>  spaced  </title>  ", "title")).toBe("spaced");
    });

    it("is case-insensitive", () => {
      expect(extractTag("<TITLE>Upper</TITLE>", "title")).toBe("Upper");
    });
  });

  describe("extractAllTags", () => {
    it("extracts all matching tags", () => {
      const xml = "<name>Alice</name><name>Bob</name><name>Charlie</name>";
      expect(extractAllTags(xml, "name")).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("returns empty array for no matches", () => {
      expect(extractAllTags("<root></root>", "missing")).toEqual([]);
    });
  });

  describe("stripXmlTags", () => {
    it("removes all XML tags", () => {
      expect(stripXmlTags("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });

    it("handles nested tags", () => {
      expect(stripXmlTags("<outer><inner>Text</inner></outer>")).toBe("Text");
    });

    it("normalizes whitespace", () => {
      expect(stripXmlTags("  <p>  lots   of   space  </p>  ")).toBe("lots of space");
    });
  });

  describe("extractAttribute", () => {
    it("extracts attribute with double quotes", () => {
      expect(extractAttribute('href="https://example.com"', "href")).toBe("https://example.com");
    });

    it("extracts attribute with single quotes", () => {
      expect(extractAttribute("href='https://example.com'", "href")).toBe("https://example.com");
    });

    it("returns undefined for missing attribute", () => {
      expect(extractAttribute('other="value"', "href")).toBeUndefined();
    });
  });

  describe("extractXmlBlocks", () => {
    it("extracts multiple blocks", () => {
      const xml = "<item>A</item><item>B</item>";
      expect(extractXmlBlocks(xml, "item")).toEqual(["A", "B"]);
    });

    it("handles multi-line content", () => {
      const xml = "<entry>\n  Line 1\n  Line 2\n</entry>";
      expect(extractXmlBlocks(xml, "entry")).toEqual(["\n  Line 1\n  Line 2\n"]);
    });
  });
});
