#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getIntentLandingPageByPath } from "../src/features/landing/intentLandingPages.ts";
import { buildIntentLandingPrerenderBody } from "../src/shared/seo/intentLandingPrerenderHtml.ts";
import { getIndexablePublicSeoPages } from "../src/shared/seo/publicSeoPages.ts";
import { SEO_BASE_URL } from "../src/shared/seo/seoConstants.ts";
import {
  applySeoToHtml,
  injectPrerenderBody,
  seoPageToHeadInput,
} from "../src/shared/seo/seoHtml.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error(`[prerender-seo] Missing ${indexPath}. Run vite build first.`);
  process.exit(1);
}

const templateHtml = fs.readFileSync(indexPath, "utf-8");

for (const page of getIndexablePublicSeoPages()) {
  let html = applySeoToHtml(templateHtml, SEO_BASE_URL, seoPageToHeadInput(page));
  const intentPage = getIntentLandingPageByPath(page.path);
  if (intentPage) {
    html = injectPrerenderBody(html, buildIntentLandingPrerenderBody(intentPage));
  }
  const outPath =
    page.path === "/" ? indexPath : path.join(distDir, page.path.slice(1), "index.html");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf-8");
  console.log(`[prerender-seo] Wrote ${page.path} -> ${path.relative(distDir, outPath)}`);
}
