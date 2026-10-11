#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getIndexablePublicSeoPages } from "../src/shared/seo/publicSeoPages.ts";
import { buildSitemapXml } from "../src/shared/seo/sitemapXml.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "../dist");
const publicDir = path.resolve(scriptDir, "../public");

const pages = getIndexablePublicSeoPages();
const sitemap = buildSitemapXml(pages);

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemap, "utf-8");
fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemap, "utf-8");

console.log(`[generate-sitemap] Wrote sitemap.xml (${pages.length} URLs)`);
