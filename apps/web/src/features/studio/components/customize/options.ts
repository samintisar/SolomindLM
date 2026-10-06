/** One choice in an OptionToggleGroup. */
export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

export const COUNT_OPTIONS = [
  { value: "fewer", label: "Fewer" },
  { value: "standard", label: "Standard" },
  { value: "more", label: "More" },
] as const satisfies readonly ToggleOption<"fewer" | "standard" | "more">[];

export const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const satisfies readonly ToggleOption<"easy" | "medium" | "hard">[];
