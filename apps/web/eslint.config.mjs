// Design-system lint only. Biome remains the primary linter; this config runs @shadcn/lint.
import { plugin as shadcn } from "@shadcn/lint";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

/** Migrated to the design system: violations are errors. Add a feature dir when its PR lands. */
const MIGRATED = ["src/shared/components/ui/**/*.tsx", "src/shared/components/motion/**/*.tsx"];

const UPSTREAM_ARBITRARY = [
  "alert-dialog",
  "alert",
  "badge",
  "card",
  "dialog",
  "dropdown-menu",
  "input-group",
  "input",
  "scroll-area",
  "select",
  "tabs",
  "textarea",
  "toggle-group",
  "toggle",
  "tooltip",
];

const rules = (level) => ({
  "shadcn/no-restyle": [level, { allow: ["layout"] }],
  "shadcn/no-raw-colors": level,
  "shadcn/no-arbitrary-values": level,
  "shadcn/no-inline-styles": level,
  "shadcn/no-unknown-classes": level,
  "shadcn/require-static-classes": level,
});

export default defineConfig([
  { ignores: ["dist/**", "node_modules/**", "**/*.test.tsx"] },
  {
    files: ["src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/shared/components/ui",
        mergeFunctions: ["cn"],
        variantFunctions: ["cva"],
        note: "Design rules: .agents/skills/shadcn/SKILL.md. Pages place components (layout only); new looks are new variants in src/shared/components/ui. Use semantic tokens (bg-success-muted, text-info), never palette colors.",
      },
    },
    rules: rules("warn"),
  },
  { files: MIGRATED, rules: rules("error") },
  // Upstream shadcn CLI markup that predates the linter (arbitrary values like ring-[3px], top-[50%],
  // transition-[color,box-shadow]). Stays at warn until each file is regenerated/adapted; all other rules
  // remain errors for these files. Do not add authored components here.
  {
    files: UPSTREAM_ARBITRARY.map((f) => `src/shared/components/ui/${f}.tsx`),
    rules: { "shadcn/no-arbitrary-values": "warn" },
  },
  // Upstream compositions that restyle sibling ui components (Field -> Label, InputGroup -> Input/Textarea/Button).
  {
    files: ["src/shared/components/ui/field.tsx", "src/shared/components/ui/input-group.tsx"],
    rules: { "shadcn/no-restyle": "warn", "shadcn/require-static-classes": "warn" },
  },
]);
