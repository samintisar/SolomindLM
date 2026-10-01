export interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  fatal?: boolean;
}

export interface LintResult {
  filePath: string;
  messages: LintMessage[];
}

/** area → rule → violation count */
export type Counts = Record<string, Record<string, number>>;

export interface CountChange {
  area: string;
  rule: string;
  baseline: number;
  current: number;
}

const RULE_PREFIXES = ["shadcn/", "solomind/"];

export function areaOf(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/src/");
  const parts = (idx === -1 ? normalized : normalized.slice(idx + "/src/".length)).split("/");
  if (parts.length === 1) return "root";
  if (parts[0] === "features" && parts.length > 2) return `features/${parts[1]}`;
  return parts[0];
}

export function countViolations(results: LintResult[]): { counts: Counts; fatal: string[] } {
  const counts: Counts = {};
  const fatal: string[] = [];
  for (const result of results) {
    for (const message of result.messages) {
      if (message.fatal) {
        fatal.push(`${result.filePath}: ${message.message}`);
        continue;
      }
      const ruleId = message.ruleId;
      if (!ruleId || !RULE_PREFIXES.some((p) => ruleId.startsWith(p))) continue;
      const area = areaOf(result.filePath);
      counts[area] ??= {};
      counts[area][ruleId] = (counts[area][ruleId] ?? 0) + 1;
    }
  }
  return { counts, fatal };
}

export function compareCounts(
  current: Counts,
  baseline: Counts
): { increases: CountChange[]; decreases: CountChange[] } {
  const increases: CountChange[] = [];
  const decreases: CountChange[] = [];
  const areas = [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort();
  for (const area of areas) {
    const rules = [
      ...new Set([...Object.keys(current[area] ?? {}), ...Object.keys(baseline[area] ?? {})]),
    ].sort();
    for (const rule of rules) {
      const now = current[area]?.[rule] ?? 0;
      const before = baseline[area]?.[rule] ?? 0;
      if (now > before) increases.push({ area, rule, baseline: before, current: now });
      if (now < before) decreases.push({ area, rule, baseline: before, current: now });
    }
  }
  return { increases, decreases };
}

/** The requested rule IDs that already appear anywhere in the baseline. */
export function rulesInBaseline(rules: string[], baseline: Counts): string[] {
  const known = new Set(Object.values(baseline).flatMap((byRule) => Object.keys(byRule)));
  return rules.filter((rule) => known.has(rule));
}

/**
 * The increases that must fail the run. Nothing may go up, except that when updating, a rule
 * explicitly named with `--new-rule` and absent from the baseline may record its first counts.
 * (sortCounts drops zero counts, so "absent" alone is not enough: a rule that was fixed and then
 * regressed looks new, which is why the exemption has to be asked for by name.)
 */
export function blockedIncreases(
  increases: CountChange[],
  baseline: Counts,
  options: { update: boolean; newRules: string[] }
): CountChange[] {
  if (!options.update) return increases;
  const tracked = new Set(rulesInBaseline(options.newRules, baseline));
  const allowed = new Set(options.newRules.filter((rule) => !tracked.has(rule)));
  return increases.filter((change) => !allowed.has(change.rule));
}

export function sortCounts(counts: Counts): Counts {
  const sorted: Counts = {};
  for (const area of Object.keys(counts).sort()) {
    const rules = Object.keys(counts[area])
      .sort()
      .filter((rule) => counts[area][rule] > 0);
    if (rules.length === 0) continue;
    sorted[area] = Object.fromEntries(rules.map((rule) => [rule, counts[area][rule]]));
  }
  return sorted;
}

const PLUGIN_WARNING = /^\[@shadcn\/lint\] .*$/gm;

/**
 * @shadcn/lint reports every fallback or misconfiguration (e.g. its Tailwind worker timing out,
 * after which no-unknown-classes uses a bundled grammar) as a `[@shadcn/lint] …` warning on
 * stderr. Counts from such a run can't be compared with the baseline, so callers must bail.
 */
export function isDegradedRun(stderr: string): string[] {
  return stderr.match(PLUGIN_WARNING) ?? [];
}
