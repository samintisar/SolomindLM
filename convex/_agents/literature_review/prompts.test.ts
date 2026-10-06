import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildExtractDataOutputSchema,
  GenerateFullReportOutputSchema,
  PdfMetadataOutputSchema,
  PlanReviewOutputSchema,
  ScreenSinglePaperOutputSchema,
} from "./prompts";

/** Together's structured-output grammar rejects `propertyNames` ("Unimplemented keys"). */
function jsonSchemaKeys(schema: z.ZodType): Set<string> {
  const keys = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        keys.add(key);
        visit(value);
      }
    }
  };
  visit(z.toJSONSchema(schema));
  return keys;
}

describe("buildExtractDataOutputSchema", () => {
  const columnIds = ["physical_activity_dose_metric", "depression_outcome_measure"];

  it("emits a JSON schema Together's grammar accepts (no propertyNames)", () => {
    expect(jsonSchemaKeys(buildExtractDataOutputSchema(columnIds)).has("propertyNames")).toBe(
      false
    );
  });

  it("names every column id as a required string property", () => {
    const json = z.toJSONSchema(buildExtractDataOutputSchema(columnIds)) as {
      properties: {
        extractedData: { properties: Record<string, { type: string }>; required: string[] };
      };
    };
    const extracted = json.properties.extractedData;
    expect(Object.keys(extracted.properties)).toEqual(columnIds);
    expect(extracted.required).toEqual(columnIds);
    for (const id of columnIds) {
      expect(extracted.properties[id].type).toBe("string");
    }
  });

  it("parses a response keyed by column id", () => {
    const parsed = buildExtractDataOutputSchema(columnIds).parse({
      extractedData: {
        physical_activity_dose_metric: "MET-h/week",
        depression_outcome_measure: "CES-D",
      },
    });
    expect(parsed.extractedData.physical_activity_dose_metric).toBe("MET-h/week");
  });
});

describe("literature review structured-output schemas", () => {
  it.each([
    ["PlanReviewOutputSchema", PlanReviewOutputSchema],
    ["ScreenSinglePaperOutputSchema", ScreenSinglePaperOutputSchema],
    ["PdfMetadataOutputSchema", PdfMetadataOutputSchema],
    ["GenerateFullReportOutputSchema", GenerateFullReportOutputSchema],
  ])("%s has no propertyNames", (_name, schema) => {
    expect(jsonSchemaKeys(schema as z.ZodType).has("propertyNames")).toBe(false);
  });
});
