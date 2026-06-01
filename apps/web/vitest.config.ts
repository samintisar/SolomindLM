import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Single React instance (Bun monorepo on Linux CI otherwise bundles two copies → useState null)
const reactRoot = path.dirname(require.resolve("react/package.json"));
const reactDomRoot = path.dirname(require.resolve("react-dom/package.json"));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: reactRoot,
      "react-dom": reactDomRoot,
      "react/jsx-runtime": require.resolve("react/jsx-runtime"),
      "react/jsx-dev-runtime": require.resolve("react/jsx-dev-runtime"),
      "@": path.resolve(__dirname, "./src"),
      // Runtime .ts so Vitest can resolve `export { api }` (d.ts has no JS exports)
      "@convex/_generated/api": path.resolve(__dirname, "./src/test/mocks/convexGeneratedApi.ts"),
      "@convex/_generated/dataModel": path.resolve(
        __dirname,
        "./src/convex-generated-dataModel.d.ts"
      ),
      "@convex": path.resolve(__dirname, "../../convex"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // CI has no apps/web .env; chatApi.ts validates CONVEX URL at import time
    env: {
      VITE_CONVEX_URL: "https://ci-placeholder.convex.cloud",
    },
  },
});
