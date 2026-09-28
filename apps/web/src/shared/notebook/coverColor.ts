/**
 * Cover swatches. These exact class strings are persisted in Convex (`notebooks.coverColor`,
 * `folders.color`), so never rename or remove them; the matching `--vintage-*` tokens in
 * index.css must stay.
 */
export const COVER_COLORS = [
  "bg-vintage-brown-300",
  "bg-vintage-red-300",
  "bg-vintage-orange-300",
  "bg-vintage-amber-300",
  "bg-vintage-amber-400",
  "bg-vintage-green-300",
  "bg-vintage-green-400",
  "bg-vintage-blue-300",
  "bg-vintage-blue-400",
  "bg-vintage-blue-500",
  "bg-vintage-brown-400",
  "bg-vintage-red-400",
  "bg-vintage-orange-400",
  "bg-vintage-amber-500",
  "bg-vintage-green-500",
  "bg-vintage-blue-200",
  "bg-vintage-red-200",
  "bg-vintage-orange-200",
] as const;

export const DEFAULT_COVER_COLOR = "bg-vintage-brown-300";
export const COVER_ICON_CLASS = "text-foreground";

const KNOWN = new Set<string>(COVER_COLORS);

/** Swatches offered by earlier versions of the picker; may still be persisted. */
const LEGACY_COVER_COLORS: Record<string, (typeof COVER_COLORS)[number]> = {
  "bg-blue-500": "bg-vintage-blue-500",
  "bg-yellow-500": "bg-vintage-amber-400",
};

export function coverFillClass(coverColor?: string | null): string {
  if (!coverColor) return DEFAULT_COVER_COLOR;
  if (KNOWN.has(coverColor)) return coverColor;
  return LEGACY_COVER_COLORS[coverColor] ?? DEFAULT_COVER_COLOR;
}
