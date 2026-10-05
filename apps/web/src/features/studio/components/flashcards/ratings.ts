import type { SrsRating } from "@/features/studio/utils/srsReviewLabels";

export type { SrsRating };

export interface RatingConfig {
  rating: SrsRating;
  label: string;
  /** Keyboard shortcut while the answer is showing. */
  key: "1" | "2" | "3" | "4";
  /** Text colour of the label and tally number. */
  toneText: string;
  /** Hover fill of the button. */
  toneHover: string;
  /** Fill of this rating's slice of the stacked progress bar. */
  toneBar: string;
  /** tw-animate-css exit classes: where a card rated this way is thrown. */
  throwClass: string;
}

export const RATINGS: readonly RatingConfig[] = [
  {
    rating: "again",
    label: "Again",
    key: "1",
    toneText: "text-destructive",
    toneHover: "hover:bg-destructive-muted",
    toneBar: "bg-destructive",
    throwClass: "slide-out-to-left -spin-out-12",
  },
  {
    rating: "hard",
    label: "Hard",
    key: "2",
    toneText: "text-warning",
    toneHover: "hover:bg-warning-muted",
    toneBar: "bg-warning",
    throwClass: "zoom-out-95",
  },
  {
    rating: "good",
    label: "Good",
    key: "3",
    toneText: "text-success",
    toneHover: "hover:bg-success-muted",
    toneBar: "bg-success",
    throwClass: "slide-out-to-right spin-out-12",
  },
  {
    rating: "easy",
    label: "Easy",
    key: "4",
    toneText: "text-info",
    toneHover: "hover:bg-info-muted",
    toneBar: "bg-info",
    throwClass: "slide-out-to-top -spin-out-3",
  },
];

export function ratingForKey(key: string): RatingConfig | undefined {
  return RATINGS.find((r) => r.key === key);
}
