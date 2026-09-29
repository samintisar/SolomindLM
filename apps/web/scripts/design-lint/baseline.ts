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

const RULE_PREFIX = "shadcn/";

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
      if (!message.ruleId?.startsWith(RULE_PREFIX)) continue;
      const area = areaOf(result.filePath);
      counts[area] ??= {};
      counts[area][message.ruleId] = (counts[area][message.ruleId] ?? 0) + 1;
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
