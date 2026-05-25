import { describe, expect, test } from "vitest";
import { buildLiteratureReportChatPreview } from "./literatureReportPreview";

describe("buildLiteratureReportChatPreview", () => {
  test("prefers Conclusion over Abstract for chat preview", () => {
    const preview = buildLiteratureReportChatPreview({
      content: "",
      sections: [
        {
          heading: "Abstract",
          content: "This systematic review examined digital interventions for treating depression.",
        },
        {
          heading: "Conclusion",
          content:
            "The review finds that digital CBT shows moderate efficacy across diverse populations.",
        },
      ],
    });

    expect(preview).toContain("The review finds");
    expect(preview).not.toContain("systematic review examined");
  });

  test("falls back to Discussion when Conclusion is missing", () => {
    const preview = buildLiteratureReportChatPreview({
      content: "",
      sections: [
        { heading: "Abstract", content: "Formal abstract text." },
        {
          heading: "Discussion",
          content: "Several studies highlight substantial limitations in benchmark coverage.",
        },
      ],
    });

    expect(preview).toContain("substantial limitations");
  });

  test("parses markdown content when sections array is empty", () => {
    const preview = buildLiteratureReportChatPreview({
      content: [
        "## Abstract",
        "",
        "Formal abstract.",
        "",
        "## Conclusion",
        "",
        "Key takeaway: ensemble evaluations are often necessary.",
      ].join("\n"),
    });

    expect(preview).toContain("ensemble evaluations");
    expect(preview).not.toContain("Formal abstract");
  });
});
