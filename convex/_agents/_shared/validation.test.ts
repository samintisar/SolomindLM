import { describe, it, expect } from "vitest";
import {
  validateOutput,
  validateWithPreset,
  validateFlashcards,
  validateQuiz,
  ValidationPresets,
} from "./validation";

describe("validateOutput", () => {
  it("returns valid for complete output with no config", () => {
    const result = validateOutput("Some complete output here.", {
      reportType: "custom",
      checkTruncation: false,
    });
    expect(result.isValid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("reports missing required sections", () => {
    const result = validateOutput("Some text without sections", {
      reportType: "custom",
      requiredSections: ["Introduction", "Conclusion"],
    });
    expect(result.isValid).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.missing[0]).toContain("Introduction");
    expect(result.missing[1]).toContain("Conclusion");
  });

  it("finds sections with ## prefix", () => {
    const result = validateOutput("## Introduction\nContent here.", {
      reportType: "custom",
      requiredSections: ["Introduction"],
    });
    expect(result.missing).toHaveLength(0);
  });

  it("finds sections with ### prefix", () => {
    const result = validateOutput("### Introduction\nContent.", {
      reportType: "custom",
      requiredSections: ["Introduction"],
    });
    expect(result.missing).toHaveLength(0);
  });

  it("finds sections in bold", () => {
    const result = validateOutput("**Introduction** is here.", {
      reportType: "custom",
      requiredSections: ["Introduction"],
    });
    expect(result.missing).toHaveLength(0);
  });

  it("finds sections anywhere in text (case-insensitive)", () => {
    const result = validateOutput("We cover introduction topics.", {
      reportType: "custom",
      requiredSections: ["Introduction"],
    });
    expect(result.missing).toHaveLength(0);
  });

  it("warns on too few items", () => {
    const output = "1. Item one\n2. Item two";
    const result = validateOutput(output, {
      reportType: "custom",
      minItems: 5,
      checkTruncation: false,
    });
    expect(result.warnings).toContain("Too few items (2/5 minimum)");
  });

  it("warns on too many items", () => {
    const output = "1. A\n2. B\n3. C\n4. D\n5. E\n6. F";
    const result = validateOutput(output, {
      reportType: "custom",
      maxItems: 3,
      checkTruncation: false,
    });
    expect(result.warnings).toContain("Too many items (6/3 maximum)");
  });

  it("detects truncation (abrupt ending)", () => {
    const result = validateOutput("This is a long sentence that ends without punctuation", {
      reportType: "custom",
      checkTruncation: true,
    });
    expect(result.warnings).toContain("Abrupt ending detected (likely truncated)");
  });

  it("does not warn on proper ending", () => {
    const result = validateOutput("This ends properly.", {
      reportType: "custom",
      checkTruncation: true,
    });
    expect(result.warnings).not.toContain("Abrupt ending detected (likely truncated)");
  });

  it("does not warn on heading endings", () => {
    const result = validateOutput("Some content\n## Next Section", {
      reportType: "custom",
      checkTruncation: true,
    });
    expect(result.warnings).not.toContain("Abrupt ending detected (likely truncated)");
  });

  it("does not warn on code block endings", () => {
    const result = validateOutput("Some content\n```", {
      reportType: "custom",
      checkTruncation: true,
    });
    expect(result.warnings).not.toContain("Abrupt ending detected (likely truncated)");
  });

  it("runs custom validation rules", () => {
    const result = validateOutput("plain text", {
      reportType: "custom",
      checkTruncation: false,
      customRules: [
        (output: string) => ({
          valid: output.includes("special"),
          message: output.includes("special") ? "" : "Missing special content",
        }),
      ],
    });
    expect(result.warnings).toContain("Missing special content");
  });

  it("calculates score with deductions", () => {
    const result = validateOutput("short", {
      reportType: "custom",
      requiredSections: ["A", "B"],
    });
    // 100 - 2*20 (missing) - warnings * 5
    expect(result.score).toBeLessThan(100);
  });

  it("gives bonus for substantial content (>1000 chars)", () => {
    const result = validateOutput("a".repeat(1100) + ".", {
      reportType: "custom",
      checkTruncation: false,
    });
    expect(result.score).toBe(100); // 100 + 5 bonus, clamped to 100
  });

  it("returns score 0 for empty output", () => {
    const result = validateOutput("", { reportType: "custom" });
    expect(result.score).toBe(0);
  });

  it("returns score 0 for whitespace-only output", () => {
    const result = validateOutput("   ", { reportType: "custom" });
    expect(result.score).toBe(0);
  });
});

describe("validateWithPreset", () => {
  it("validates with study_guide preset", () => {
    const result = validateWithPreset("basic content", "study_guide");
    expect(result.isValid).toBe(false);
    // study_guide requires 6 sections + 10 min items
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("validates with briefing preset", () => {
    const output = "## Executive Summary\nContent\n## Main Themes\nContent\n## Key Findings\nContent\n## Recommendations\nContent.";
    const result = validateWithPreset(output, "briefing");
    expect(result.missing).toHaveLength(0);
  });

  it("validates with blog_post preset", () => {
    const output = "## Introduction\n1. Takeaway one\n2. Takeaway two\n3. Takeaway three\n## Conclusion";
    const result = validateWithPreset(output, "blog_post");
    expect(result.missing).toHaveLength(0);
  });

  it("validates with summary preset", () => {
    const output = "## Overview\n## Main Arguments\n## Conclusions";
    const result = validateWithPreset(output, "summary");
    expect(result.missing).toHaveLength(0);
  });

  it("validates with technical_report preset", () => {
    const output = "## Executive Summary\n## Technical Specifications\n## Methodologies\n## Findings";
    const result = validateWithPreset(output, "technical_report");
    expect(result.missing).toHaveLength(0);
  });

  it("validates with concept_explainer preset", () => {
    const output = "## Introduction\n## Core Concepts\n## Examples";
    const result = validateWithPreset(output, "concept_explainer");
    expect(result.missing).toHaveLength(0);
  });

  it("validates flashcards preset with Q&A format", () => {
    const output = "Q: What is X?\nA: X is Y.";
    const result = validateWithPreset(output, "flashcards");
    // Should pass the custom Q&A rule
    expect(result.warnings).not.toContain("Missing Q&A format");
  });

  it("rejects flashcards preset without Q&A format", () => {
    const result = validateWithPreset("just plain text", "flashcards");
    expect(result.warnings).toContain("Missing Q&A format");
  });

  it("validates quiz preset with proper format", () => {
    const output = "1. Question?\na) Option A\nb) Option B\nAnswer: a";
    const _result = validateWithPreset(output, "quiz");
    // Should pass both custom rules
  });

  it("validates mindmap preset with hierarchy", () => {
    const output = "# Root Topic\n  Child 1\n  Child 2";
    const result = validateWithPreset(output, "mindmap");
    expect(result.warnings).not.toContain("Missing root topic (#)");
    expect(result.warnings).not.toContain("Missing hierarchical structure");
  });

  it("rejects mindmap preset without root topic", () => {
    const result = validateWithPreset("  just indented text", "mindmap");
    expect(result.warnings).toContain("Missing root topic (#)");
  });

  it("returns warning for unknown preset", () => {
    // TypeScript would catch this at compile time, but runtime guard test
     
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = validateWithPreset("content" as any, "nonexistent" as any);
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain("Unknown validation preset");
    expect(result.score).toBe(0);
  });
});

describe("validateFlashcards", () => {
  it("returns valid for matching Q&A count", () => {
    const output = "Q: What?\nA: This.\nQ: Why?\nA: Because.";
    const result = validateFlashcards(output, 2);
    expect(result.isValid).toBe(true);
    expect(result.score).toBe(100);
  });

  it("warns on Q&A count mismatch", () => {
    const output = "Q: What?\nQ: Why?\nA: Because.";
    const result = validateFlashcards(output, 2);
    expect(result.warnings).toContain("Mismatch between questions and answers");
  });

  it("warns when below 80% tolerance", () => {
    // Target 10, only 1 generated → below 80%
    const output = "Q: One?\nA: One answer.";
    const result = validateFlashcards(output, 10);
    expect(result.warnings.some((w) => w.includes("target was 10"))).toBe(true);
  });

  it("passes within 80% tolerance", () => {
    // Target 5, 4 generated → 80% = 4, exactly at threshold
    const output = Array.from({ length: 4 }, (_, i) => `Q: ${i}?\nA: ${i}.`).join("\n");
    const result = validateFlashcards(output, 5);
    expect(result.warnings.some((w) => w.includes("target was 5"))).toBe(false);
  });

  it("returns score 70 when issues exist", () => {
    const output = "Q: Only one?\nA: Answer.";
    const result = validateFlashcards(output, 10);
    expect(result.score).toBe(70);
  });
});

describe("validateQuiz", () => {
  it("returns valid for complete quiz", () => {
    const output = "1. Question?\nAnswer: a";
    const result = validateQuiz(output, 1);
    expect(result.isValid).toBe(true);
    expect(result.score).toBe(100);
  });

  it("warns when below 80% question target", () => {
    const output = "1. Only one?\nAnswer: a";
    const result = validateQuiz(output, 10);
    expect(result.warnings.some((w) => w.includes("target was 10"))).toBe(true);
  });

  it("warns on missing answer key", () => {
    const output = "1. Question one?\n2. Question two?";
    const result = validateQuiz(output, 2);
    expect(result.warnings).toContain("Missing answer key");
  });

  it("passes within 80% tolerance", () => {
    const output = Array.from({ length: 4 }, (_, i) => `${i + 1}. Q${i}?`).join("\n") + "\nAnswer: a";
    const result = validateQuiz(output, 5);
    expect(result.warnings.some((w) => w.includes("target was 5"))).toBe(false);
  });

  it("returns score 70 when issues exist", () => {
    const output = "1. Q?\nAnswer: a";
    const result = validateQuiz(output, 10);
    expect(result.score).toBe(70);
  });
});

describe("ValidationPresets", () => {
  it("has all expected presets", () => {
    const expected = [
      "study_guide",
      "briefing",
      "blog_post",
      "flashcards",
      "quiz",
      "summary",
      "technical_report",
      "concept_explainer",
      "mindmap",
    ];
    for (const name of expected) {
      expect(ValidationPresets[name as keyof typeof ValidationPresets]).toBeDefined();
    }
  });
});
