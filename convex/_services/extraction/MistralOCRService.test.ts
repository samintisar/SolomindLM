import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalServiceError } from "../../_lib/errors";
import { UserFacingSourceError } from "../../_lib/sourceFailure";
import {
  buildOcrRequestBody,
  figureBlock,
  hasOcrContent,
  inlineOcrFigures,
  MistralOCRService,
  MistralOcrTimeoutError,
  markdownFromMistralOcrResponse,
  NOTHING_READABLE_MESSAGE,
  ocrInputKindForFile,
  parseFigureAnnotation,
  shouldRetryWithoutAnnotations,
} from "./MistralOCRService";

const TABLE = "| Indicator | 2025 | 2026 |\n| --- | --- | --- |\n| Brent ($/b) | $69 | $91 |";

const CHART = {
  kind: "chart",
  description: "Revenue by region.",
  details: "EMEA rises from 1.2M to 2.0M.",
};

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

  it("inlines figure descriptions on their page", () => {
    const md = markdownFromMistralOcrResponse({
      pages: [
        { markdown: "one" },
        {
          markdown: "![img-0.jpeg](img-0.jpeg)",
          images: [{ id: "img-0.jpeg", image_annotation: JSON.stringify(CHART) }],
        },
      ],
    });
    expect(md).toBe(`**Page 1**\n\none\n\n---\n\n**Page 2**\n\n${figureBlock(CHART)}`);
  });

  it("reports malformed figure annotations through the option", () => {
    const onMalformedAnnotation = vi.fn();
    markdownFromMistralOcrResponse(
      {
        pages: [
          {
            markdown: "![img-0.jpeg](img-0.jpeg)",
            images: [{ id: "img-0.jpeg", image_annotation: "{bad" }],
          },
        ],
      },
      { onMalformedAnnotation }
    );
    expect(onMalformedAnnotation).toHaveBeenCalledWith("img-0.jpeg");
  });
});

describe("parseFigureAnnotation", () => {
  it("reads an annotation given as a JSON string", () => {
    expect(parseFigureAnnotation(JSON.stringify(CHART))).toEqual({
      status: "ok",
      annotation: CHART,
    });
  });

  it("reads an annotation given as an object", () => {
    expect(parseFigureAnnotation(CHART)).toEqual({ status: "ok", annotation: CHART });
  });

  it("collapses whitespace so the description stays on one blockquote line", () => {
    const parsed = parseFigureAnnotation({
      kind: "diagram",
      description: "A\n  flow\tchart.",
      details: " x \n y ",
    });
    expect(parsed).toEqual({
      status: "ok",
      annotation: { kind: "diagram", description: "A flow chart.", details: "x y" },
    });
  });

  it("skips absent, empty and logo annotations", () => {
    expect(parseFigureAnnotation(undefined)).toEqual({ status: "skip" });
    expect(parseFigureAnnotation("")).toEqual({ status: "skip" });
    expect(parseFigureAnnotation({ ...CHART, description: "  " })).toEqual({ status: "skip" });
    expect(parseFigureAnnotation({ ...CHART, kind: "logo" })).toEqual({ status: "skip" });
  });

  it("flags unparseable or wrongly shaped annotations as malformed", () => {
    expect(parseFigureAnnotation("{not json")).toEqual({ status: "malformed" });
    expect(parseFigureAnnotation(42)).toEqual({ status: "malformed" });
    expect(parseFigureAnnotation({ kind: "chart" })).toEqual({ status: "malformed" });
  });

  it("defaults a missing kind to other and missing details to empty", () => {
    expect(parseFigureAnnotation({ description: "A map." })).toEqual({
      status: "ok",
      annotation: { kind: "other", description: "A map.", details: "" },
    });
  });
});

describe("figureBlock", () => {
  it("renders a description and details as a blockquote", () => {
    expect(figureBlock(CHART)).toBe(
      "> **Figure (chart):** Revenue by region.\n> Details: EMEA rises from 1.2M to 2.0M."
    );
  });

  it("omits the details line when details are empty", () => {
    expect(figureBlock({ ...CHART, details: "" })).toBe("> **Figure (chart):** Revenue by region.");
  });
});

describe("inlineOcrFigures", () => {
  const BLOCK = figureBlock(CHART);

  it("replaces the placeholder in place, under either annotation field name", () => {
    for (const field of ["image_annotation", "bbox_annotation"]) {
      const md = inlineOcrFigures("Intro\n\n![img-0.jpeg](img-0.jpeg)\n\nOutro", [
        { id: "img-0.jpeg", [field]: JSON.stringify(CHART) },
      ]);
      expect(md).toBe(`Intro\n\n${BLOCK}\n\nOutro`);
    }
  });

  it("leaves the placeholder for the media stripper when the figure is skipped", () => {
    const md = inlineOcrFigures("![img-0.jpeg](img-0.jpeg)", [
      { id: "img-0.jpeg", image_annotation: { ...CHART, kind: "logo" } },
    ]);
    expect(md).toBe("![img-0.jpeg](img-0.jpeg)");
  });

  it("reports malformed annotations by image id", () => {
    const onMalformed = vi.fn();
    inlineOcrFigures(
      "![img-0.jpeg](img-0.jpeg)",
      [{ id: "img-0.jpeg", image_annotation: "{bad" }],
      onMalformed
    );
    expect(onMalformed).toHaveBeenCalledWith("img-0.jpeg");
  });

  it("appends a figure whose placeholder is missing at the end of the page", () => {
    const md = inlineOcrFigures("text", [{ id: "img-3.jpeg", image_annotation: CHART }]);
    expect(md).toBe(`text\n\n${BLOCK}`);
  });

  it("keeps dollar signs in descriptions literal", () => {
    const md = inlineOcrFigures("![a](a)", [
      {
        id: "a",
        image_annotation: { kind: "chart", description: "Price $& and $$.", details: "" },
      },
    ]);
    expect(md).toBe("> **Figure (chart):** Price $& and $$.");
  });

  it("matches ids with regex characters literally", () => {
    const md = inlineOcrFigures("![x](img-(1).png)", [
      { id: "img-(1).png", image_annotation: CHART },
    ]);
    expect(md).toBe(BLOCK);
  });
});

describe("hasOcrContent", () => {
  it("is false for page labels, separators and whitespace only", () => {
    expect(hasOcrContent("")).toBe(false);
    expect(hasOcrContent("**Page 1**")).toBe(false);
    expect(hasOcrContent("**Page 1**\n\n   \n\n---\n\n**Page 2**\n\n")).toBe(false);
  });

  it("is true when a page has text", () => {
    expect(hasOcrContent("**Page 1**\n\nHello")).toBe(true);
  });

  it("is true when a page has only a figure description", () => {
    expect(hasOcrContent(`**Page 1**\n\n${figureBlock(CHART)}`)).toBe(true);
  });
});

describe("ocrInputKindForFile", () => {
  it("treats image extensions as images, case-insensitively", () => {
    for (const name of ["a.png", "b.JPG", "c.jpeg", "d.avif"])
      expect(ocrInputKindForFile(name)).toBe("image");
  });

  it("treats everything else as a document", () => {
    for (const name of ["a.pdf", "b.pptx", "c.docx", "no-extension"]) {
      expect(ocrInputKindForFile(name)).toBe("document");
    }
  });
});

describe("buildOcrRequestBody", () => {
  it("sends documents as document_url with figure annotations", () => {
    const body = buildOcrRequestBody("https://x/a.pdf", "document", true);
    expect(body.document).toEqual({ type: "document_url", document_url: "https://x/a.pdf" });
    expect(body.model).toBe("mistral-ocr-latest");
    expect(body.table_format).toBe("markdown");
    expect(body).toHaveProperty("bbox_annotation_format");
    expect(body).not.toHaveProperty("document_annotation_format");
  });

  it("sends images as image_url with figure annotations", () => {
    const body = buildOcrRequestBody("https://x/storage/abc", "image", true);
    expect(body.document).toEqual({ type: "image_url", image_url: "https://x/storage/abc" });
    expect(body).toHaveProperty("bbox_annotation_format");
    expect(body).not.toHaveProperty("document_annotation_format");
  });

  it("leaves out annotation formats for the plain fallback request", () => {
    const body = buildOcrRequestBody("https://x/storage/abc", "image", false);
    expect(body).not.toHaveProperty("bbox_annotation_format");
  });
});

describe("shouldRetryWithoutAnnotations", () => {
  const http = (status: number) =>
    new ExternalServiceError("mistral", `mistral HTTP ${status}`, { statusCode: status });

  it("falls back on a rejected request or a timeout", () => {
    expect(shouldRetryWithoutAnnotations(http(400))).toBe(true);
    expect(shouldRetryWithoutAnnotations(http(422))).toBe(true);
    expect(shouldRetryWithoutAnnotations(new MistralOcrTimeoutError())).toBe(true);
  });

  it("does not fall back on rate limits, server errors or unknown errors", () => {
    expect(shouldRetryWithoutAnnotations(http(429))).toBe(false);
    expect(shouldRetryWithoutAnnotations(http(503))).toBe(false);
    expect(shouldRetryWithoutAnnotations(new Error("boom"))).toBe(false);
  });
});

describe("MistralOCRService.processDocument", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const rejected = (status: number) =>
    new Response(JSON.stringify({ message: "rejected" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);

  it("asks for annotations and returns figure descriptions inline", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      ok({
        pages: [
          {
            markdown: "![img-0.jpeg](img-0.jpeg)",
            images: [{ id: "img-0.jpeg", image_annotation: JSON.stringify(CHART) }],
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const md = await new MistralOCRService("key").processDocument("https://x/a.pdf");

    expect(md).toBe(`**Page 1**\n\n${figureBlock(CHART)}`);
    expect(sentBody(fetchMock, 0)).toHaveProperty("bbox_annotation_format");
  });

  it("sends image uploads as image_url", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await new MistralOCRService("key").processDocument("https://x/storage/abc", { kind: "image" });

    expect(sentBody(fetchMock, 0).document).toEqual({
      type: "image_url",
      image_url: "https://x/storage/abc",
    });
  });

  it("retries once without annotations when they are rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rejected(422))
      .mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const md = await new MistralOCRService("key").processDocument("https://x/a.pdf");

    expect(md).toBe("**Page 1**\n\ntext");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 1)).not.toHaveProperty("bbox_annotation_format");
  });

  it("retries once without annotations when the annotated request times out", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      )
      .mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const md = await new MistralOCRService("key").processDocument("https://x/a.pdf");

    expect(md).toBe("**Page 1**\n\ntext");
    expect(sentBody(fetchMock, 1)).not.toHaveProperty("bbox_annotation_format");
  });

  it("fails with a user-facing message when nothing is readable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok({ pages: [{ markdown: "" }] })));

    const err = await new MistralOCRService("key")
      .processDocument("https://x/storage/abc", { kind: "image" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UserFacingSourceError);
    expect(err.userMessage).toBe(NOTHING_READABLE_MESSAGE);
  });
});
