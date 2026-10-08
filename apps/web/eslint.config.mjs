// Design-system lint only. Biome remains the primary linter; this config runs @shadcn/lint.
import { plugin as shadcn } from "@shadcn/lint";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import softSurfaces from "./scripts/design-lint/soft-surfaces-rule.mjs";

const solomind = { meta: { name: "solomind" }, rules: { "soft-surfaces": softSurfaces } };

/** Migrated to the design system: violations are errors. Add a feature dir when its PR lands. */
const MIGRATED = [
  "src/shared/components/ui/**/*.tsx",
  "src/shared/components/motion/**/*.tsx",
  "src/features/auth/**/*.tsx",
  "src/features/onboarding/**/*.tsx",
  "src/features/notebooks/**/*.tsx",
  "src/features/chat/**/*.tsx",
  "src/features/sources/**/*.tsx",
  "src/dev/**/*.tsx",
  "src/shared/ui/**/*.tsx",
  "src/shared/components/*.tsx",
  "src/shared/components/icons/**/*.tsx",
  "src/features/billing/**/*.tsx",
  "src/features/audio/**/*.tsx",
  "src/features/feedback/**/*.tsx",
  "src/features/legal/**/*.tsx",
  // Studio (#264).
  "src/features/studio/**/*.tsx",
  // Landing: the home page and the content templates (#263).
  "src/features/landing/*.tsx",
  "src/features/landing/components/**/*.tsx",
];

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
  "tooltip",
];

const rules = (level) => ({
  "shadcn/no-restyle": [level, { allow: ["layout"] }],
  "shadcn/no-raw-colors": level,
  "shadcn/no-arbitrary-values": level,
  "shadcn/no-inline-styles": level,
  "shadcn/no-unknown-classes": level,
  "shadcn/require-static-classes": level,
  // Soft layered look (docs/design/principles.md): warn in general, error in MIGRATED like the shadcn rules.
  "solomind/soft-surfaces": level,
});

export default defineConfig([
  { ignores: ["dist/**", "node_modules/**", "**/*.test.tsx"] },
  {
    files: ["src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn, solomind },
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
  // Company logos keep their real brand colours, as the persisted cover swatches do; every other
  // rule still applies to this file.
  {
    files: ["src/shared/components/icons/ModelBrandIcon.tsx"],
    rules: { "shadcn/no-raw-colors": "off" },
  },
  // Infographic style thumbnails illustrate the generated image's palette (kawaii pastels, clay
  // shadows, anime outlines), not app chrome, like the brand colours in ModelBrandIcon.
  {
    files: ["src/features/studio/components/customize/InfographicStyleThumbnail.tsx"],
    rules: {
      "shadcn/no-raw-colors": "off",
      "shadcn/no-arbitrary-values": "off",
      "solomind/soft-surfaces": "off",
    },
  },
  // Primitives own the look; outline exceptions there are reviewed variants (docs/design/principles.md).
  { files: ["src/shared/components/ui/**/*.tsx"], rules: { "solomind/soft-surfaces": "off" } },
]);
