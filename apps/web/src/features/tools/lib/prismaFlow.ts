/** A box count: a whole number, or null while the field is blank. */
export type Count = number | null;

export type ExclusionReason = { id: string; label: string; count: Count };

export type MainCounts = {
  databases: Count;
  registers: Count;
  duplicatesRemoved: Count;
  automationRemoved: Count;
  otherRemoved: Count;
  recordsScreened: Count;
  recordsExcluded: Count;
  reportsSought: Count;
  reportsNotRetrieved: Count;
  reportsAssessed: Count;
  studiesIncluded: Count;
  reportsIncluded: Count;
};

export type OtherCounts = {
  websites: Count;
  organisations: Count;
  citationSearching: Count;
  reportsSought: Count;
  reportsNotRetrieved: Count;
  reportsAssessed: Count;
};

/** Everything the PRISMA 2020 (new review) diagram shows. */
export type PrismaFlowState = {
  main: MainCounts;
  reasons: ExclusionReason[];
  /** Draws the "other methods" column (websites, organisations, citation searching). */
  otherMethods: boolean;
  other: OtherCounts;
  otherReasons: ExclusionReason[];
};

/** Key order is the URL wire format: append new keys, never reorder. */
export const MAIN_COUNT_KEYS = [
  "databases",
  "registers",
  "duplicatesRemoved",
  "automationRemoved",
  "otherRemoved",
  "recordsScreened",
  "recordsExcluded",
  "reportsSought",
  "reportsNotRetrieved",
  "reportsAssessed",
  "studiesIncluded",
  "reportsIncluded",
] as const satisfies readonly (keyof MainCounts)[];

export const OTHER_COUNT_KEYS = [
  "websites",
  "organisations",
  "citationSearching",
  "reportsSought",
  "reportsNotRetrieved",
  "reportsAssessed",
] as const satisfies readonly (keyof OtherCounts)[];

export const MAX_COUNT = 9_999_999;
export const MAX_REASONS = 12;
export const MAX_REASON_LABEL = 80;
const DEFAULT_REASON_ROWS = 3;

let reasonSeq = 0;

/** A reason row with a fresh id (a React key only; ids are not saved in the URL). */
export function newReason(label = "", count: Count = null): ExclusionReason {
  reasonSeq += 1;
  return { id: `reason-${reasonSeq}`, label, count };
}

function blankCounts<K extends string>(keys: readonly K[]): Record<K, Count> {
  return Object.fromEntries(keys.map((key) => [key, null])) as Record<K, Count>;
}

const blankReasons = () => Array.from({ length: DEFAULT_REASON_ROWS }, () => newReason());

export function createEmptyPrismaState(): PrismaFlowState {
  return {
    main: blankCounts(MAIN_COUNT_KEYS),
    reasons: blankReasons(),
    otherMethods: false,
    other: blankCounts(OTHER_COUNT_KEYS),
    otherReasons: blankReasons(),
  };
}

/** True while nothing has been typed: no counts, no named or counted reasons, other methods off. */
export function isPrismaStateEmpty(state: PrismaFlowState): boolean {
  const noCounts = (counts: Record<string, Count>) =>
    Object.values(counts).every((value) => value === null);
  const noReasons = (reasons: ExclusionReason[]) =>
    reasons.every((reason) => reason.label.trim() === "" && reason.count === null);
  return (
    !state.otherMethods &&
    noCounts(state.main) &&
    noCounts(state.other) &&
    noReasons(state.reasons) &&
    noReasons(state.otherReasons)
  );
}

/** Reads a typed count: digits only (commas and spaces ignored), capped at MAX_COUNT; blank → null. */
export function parseCount(input: string): Count {
  const digits = input.replace(/\D/g, "");
  if (digits === "") return null;
  return Math.min(Number(digits), MAX_COUNT);
}

/** The template's count suffix; a blank count prints "(n = )" like the blank template. */
export const formatCount = (count: Count) => `(n = ${count ?? ""})`;

export const reasonLabel = (reason: ExclusionReason, index: number) =>
  reason.label.trim() || `Reason ${index + 1}`;

/** Adds the filled numbers; null when every one is blank. */
export function total(counts: Count[]): Count {
  const filled = counts.filter((count): count is number => count !== null);
  return filled.length === 0 ? null : filled.reduce((sum, count) => sum + count, 0);
}

type PrismaWarningField =
  | "recordsScreened"
  | "reportsAssessed"
  | "otherReportsAssessed"
  | "reportsIncluded";

export type PrismaWarning = { field: PrismaWarningField; message: string };

function assessedMismatch(sought: Count, notRetrieved: Count, assessed: Count): string | null {
  if (sought === null || assessed === null) return null;
  const expected = sought - (notRetrieved ?? 0);
  if (expected === assessed) return null;
  return `Sought ${sought} − not retrieved ${notRetrieved ?? 0} = ${expected}, but reports assessed is ${assessed}.`;
}

/**
 * Arithmetic checks within one unit (records, or reports). They only warn: the diagram always draws
 * what was typed. Blank parts of a sum count as 0; a check runs once both sides have a number.
 */
export function checkPrismaCounts(state: PrismaFlowState): PrismaWarning[] {
  const { main, other, otherMethods } = state;
  const warnings: PrismaWarning[] = [];

  const identified = total([main.databases, main.registers]);
  const removed = total([main.duplicatesRemoved, main.automationRemoved, main.otherRemoved]) ?? 0;
  if (
    identified !== null &&
    main.recordsScreened !== null &&
    identified - removed !== main.recordsScreened
  ) {
    warnings.push({
      field: "recordsScreened",
      message: `Identified ${identified} − removed ${removed} = ${identified - removed}, but records screened is ${main.recordsScreened}.`,
    });
  }

  const mainAssessed = assessedMismatch(
    main.reportsSought,
    main.reportsNotRetrieved,
    main.reportsAssessed
  );
  if (mainAssessed) warnings.push({ field: "reportsAssessed", message: mainAssessed });
  if (otherMethods) {
    const otherAssessed = assessedMismatch(
      other.reportsSought,
      other.reportsNotRetrieved,
      other.reportsAssessed
    );
    if (otherAssessed) warnings.push({ field: "otherReportsAssessed", message: otherAssessed });
  }

  const assessed = total(
    otherMethods ? [main.reportsAssessed, other.reportsAssessed] : [main.reportsAssessed]
  );
  const reasons = otherMethods ? [...state.reasons, ...state.otherReasons] : state.reasons;
  const excluded = total(reasons.map((reason) => reason.count));
  if (
    assessed !== null &&
    excluded !== null &&
    main.reportsIncluded !== null &&
    assessed - excluded !== main.reportsIncluded
  ) {
    warnings.push({
      field: "reportsIncluded",
      message: `Assessed ${assessed} − excluded ${excluded} = ${assessed - excluded}, but reports of included studies is ${main.reportsIncluded}.`,
    });
  }

  return warnings;
}
