export const DEFAULT_COVER_COLOR = "bg-vintage-brown-300";
export const COVER_ICON_CLASS = "text-foreground";

export function coverFillClass(coverColor?: string | null): string {
  return coverColor?.startsWith("bg-") ? coverColor : DEFAULT_COVER_COLOR;
}
