import js from "@eslint/js";
import { ESLint } from "eslint";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";

export default defineConfig(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks as ESLint.Plugin,
      "react-refresh": reactRefresh as ESLint.Plugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      // React 19 + react-hooks v7: these flag many valid patterns (URL sync, ref mirrors,
      // latest-props-in-callback). Keep as warnings so `eslint .` stays clean; tighten over time.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  prettierConfig,
  {
    ignores: [
      "convex/_generated/**",
      "apps/web/node_modules/.vite/**",
      "apps/web/dist/**",
      "dist/**",
      ".claude/**",
      ".worktrees/**",
      "node_modules/**",
      "archive/**",
      "apps/mobile/.expo/**",
      "apps/mobile/components/__tests__/**",
      "apps/mobile/metro.config.js",
    ],
  },
  {
    files: ["scripts/**", "convex/scripts/**"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  }
);
