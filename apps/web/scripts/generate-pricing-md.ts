#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPricingMarkdown } from "../src/shared/seo/pricingMarkdown.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../dist");
const publicDir = path.resolve(scriptDir, "../public");

const markdown = buildPricingMarkdown();

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "pricing.md"), markdown, "utf-8");
fs.writeFileSync(path.join(publicDir, "pricing.md"), markdown, "utf-8");

console.log("[generate-pricing-md] Wrote pricing.md");
