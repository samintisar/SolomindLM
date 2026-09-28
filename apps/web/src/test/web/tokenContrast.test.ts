// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

// Strip CSS comments. The guard skips `/*` glued to a path (e.g. `@source "…/dist/*.js"`).
const css = readFileSync(
  fileURLToPath(new URL("../../index.css", import.meta.url)),
  "utf8"
).replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1");
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`No ${selector} block in index.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const light = tokens(":root");
const dark = { ...light, ...tokens(".dark") };

// [text, background, minimum ratio]
const PAIRS: Array<[string, string, number]> = [
  ["foreground", "background", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["card-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["success-foreground", "success", 4.5],
  ["warning-foreground", "warning", 4.5],
  ["info-foreground", "info", 4.5],
  ["success-muted-foreground", "success-muted", 4.5],
  ["warning-muted-foreground", "warning-muted", 4.5],
  ["info-muted-foreground", "info-muted", 4.5],
  ["destructive-muted-foreground", "destructive-muted", 4.5],
];

describe.each([
  ["light", light],
  ["dark", dark],
  ["auth (pinned light)", { ...light, ...tokens(".auth-form-light") }],
])("%s theme contrast (WCAG AA)", (_theme, t) => {
  it.each(PAIRS)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(t[fg], `missing --${fg}`).toBeDefined();
    expect(t[bg], `missing --${bg}`).toBeDefined();
    expect(wcagContrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
