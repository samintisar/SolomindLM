import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatUsd, PRO_PRICE_USD, PRO_YEARLY_PER_MONTH_USD } from "@/features/billing/planPricing";
import { PLANS } from "@/features/landing/components/home/landingHomeContent";
import { buildPricingMarkdown } from "./pricingMarkdown";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readPublic = (file: string) => readFileSync(path.join(webRoot, "public", file), "utf-8");

describe("pricing.md", () => {
  const markdown = buildPricingMarkdown();

  it("states each price, billing period and limit from the plan sources", () => {
    expect(markdown).toContain(`| Free | ${formatUsd(0)} |`);
    expect(markdown).toContain(
      `| Pro, billed yearly | ${formatUsd(PRO_YEARLY_PER_MONTH_USD)} / month |`
    );
    expect(markdown).toContain(`${formatUsd(PRO_PRICE_USD.yearly)} billed once a year`);
    expect(markdown).toContain(
      `| Pro, billed monthly | ${formatUsd(PRO_PRICE_USD.monthly)} / month |`
    );
    for (const plan of PLANS) {
      expect(markdown).toContain(`## ${plan.name}`);
      for (const feature of plan.features) {
        expect(markdown).toContain(`- ${feature}`);
      }
    }
  });

  it("links the canonical /pricing page", () => {
    expect(markdown).toContain("https://www.solomindlm.com/pricing");
  });

  it("matches the committed public/pricing.md (run scripts/generate-pricing-md.ts)", () => {
    expect(readPublic("pricing.md")).toBe(markdown);
  });
});

describe("llms.txt and llms-full.txt", () => {
  it.each(["llms.txt", "llms-full.txt"])(
    "%s links /pricing and /pricing.md, not /#pricing",
    (file) => {
      const text = readPublic(file);
      expect(text).toContain("https://www.solomindlm.com/pricing\n");
      expect(text).toContain("https://www.solomindlm.com/pricing.md");
      expect(text).not.toContain("/#pricing");
    }
  );

  it.each(["llms.txt", "llms-full.txt"])("%s quotes the current Pro prices", (file) => {
    const text = readPublic(file);
    expect(text).toContain(
      `${formatUsd(PRO_YEARLY_PER_MONTH_USD)}/month billed yearly or ${formatUsd(PRO_PRICE_USD.monthly)}/month billed monthly`
    );
  });
});
