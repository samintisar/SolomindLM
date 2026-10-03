import { describe, expect, it } from "vitest";
import { markdownFromMistralOcrResponse } from "./MistralOCRService";

const TABLE = "| Indicator | 2025 | 2026 |\n| --- | --- | --- |\n| Brent ($/b) | $69 | $91 |";

describe("markdownFromMistralOcrResponse", () => {
  it("labels and joins pages", () => {
    expect(
      markdownFromMistralOcrResponse({ pages: [{ markdown: "one" }, { markdown: "two" }] })
    ).toBe("**Page 1**\n\none\n\n---\n\n**Page 2**\n\ntwo");
  });

  it("replaces each table placeholder with the table content", () => {
    const md = markdownFromMistralOcrResponse({
      pages: [
        {
          markdown: "## Overview\n\n[tbl-0.md](tbl-0.md)\n\nNote: values are rounded.",
          tables: [{ id: "tbl-0.md", format: "markdown", content: TABLE }],
        },
      ],
    });
    expect(md).toContain(TABLE);
    expect(md).not.toContain("[tbl-0.md]");
    expect(md.indexOf("## Overview")).toBeLessThan(md.indexOf(TABLE));
    expect(md.indexOf(TABLE)).toBeLessThan(md.indexOf("Note: values are rounded."));
  });

  it("inlines several tables per page, html tables too", () => {
    const md = markdownFromMistralOcrResponse({
      pages: [
        {
          markdown: "[tbl-0.md](tbl-0.md)\n\ntext\n\n[tbl-1.html](tbl-1.html)",
          tables: [
            { id: "tbl-0.md", content: "A" },
            { id: "tbl-1.html", content: "<table><tr><td>B</td></tr></table>" },
          ],
        },
      ],
    });
    expect(md).toBe("**Page 1**\n\nA\n\ntext\n\n<table><tr><td>B</td></tr></table>");
  });

  it("keeps dollar signs in table content literal", () => {
    const md = markdownFromMistralOcrResponse({
      pages: [
        { markdown: "[tbl-0.md](tbl-0.md)", tables: [{ id: "tbl-0.md", content: "| $& | $$ |" }] },
      ],
    });
    expect(md).toBe("**Page 1**\n\n| $& | $$ |");
  });

  it("appends a table whose placeholder is missing instead of dropping it", () => {
    const md = markdownFromMistralOcrResponse({
      pages: [{ markdown: "text", tables: [{ id: "tbl-0.md", content: TABLE }] }],
    });
    expect(md).toBe(`**Page 1**\n\ntext\n\n${TABLE}`);
  });
});
