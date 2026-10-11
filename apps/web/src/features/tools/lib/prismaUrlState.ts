import {
  type Count,
  type ExclusionReason,
  MAIN_COUNT_KEYS,
  MAX_COUNT,
  MAX_REASON_LABEL,
  MAX_REASONS,
  type MainCounts,
  newReason,
  OTHER_COUNT_KEYS,
  type OtherCounts,
  type PrismaFlowState,
} from "./prismaFlow";

const HASH_PARAM = "d";
const MAX_ENCODED_LENGTH = 20_000;

/** Wire format v1: counts in key order, reasons as [label, count] pairs. */
type Wire = {
  v: 1;
  m: Count[];
  r: [string, Count][];
  o: 0 | 1;
  oc: Count[];
  or: [string, Count][];
};

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function toCount(value: unknown): Count {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, MAX_COUNT)
    : null;
}

function toReasons(value: unknown): ExclusionReason[] {
  return asArray(value)
    .slice(0, MAX_REASONS)
    .map((item) => {
      const [label, count] = asArray(item);
      return newReason(
        typeof label === "string" ? label.slice(0, MAX_REASON_LABEL) : "",
        toCount(count)
      );
    });
}

function toCounts<K extends string>(keys: readonly K[], value: unknown): Record<K, Count> {
  const values = asArray(value);
  return Object.fromEntries(keys.map((key, i) => [key, toCount(values[i])])) as Record<K, Count>;
}

/** The hash body (without "#"): `d=<base64url JSON>`. */
export function encodePrismaState(state: PrismaFlowState): string {
  const wire: Wire = {
    v: 1,
    m: MAIN_COUNT_KEYS.map((key) => state.main[key]),
    r: state.reasons.map((reason) => [reason.label, reason.count]),
    o: state.otherMethods ? 1 : 0,
    oc: OTHER_COUNT_KEYS.map((key) => state.other[key]),
    or: state.otherReasons.map((reason) => [reason.label, reason.count]),
  };
  return `${HASH_PARAM}=${toBase64Url(JSON.stringify(wire))}`;
}

/** True when a location hash carries the diagram parameter, valid or not (not an in-page anchor). */
export const hasPrismaHash = (hash: string) =>
  new URLSearchParams(hash.replace(/^#/, "")).has(HASH_PARAM);

/** Reads a location hash; null when it holds no valid diagram. Never throws. */
export function decodePrismaState(hash: string): PrismaFlowState | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, "")).get(HASH_PARAM);
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH) return null;

  let wire: unknown;
  try {
    wire = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (!isRecord(wire) || wire.v !== 1) return null;

  return {
    main: toCounts(MAIN_COUNT_KEYS, wire.m) as MainCounts,
    reasons: toReasons(wire.r),
    otherMethods: wire.o === 1,
    other: toCounts(OTHER_COUNT_KEYS, wire.oc) as OtherCounts,
    otherReasons: toReasons(wire.or),
  };
}
