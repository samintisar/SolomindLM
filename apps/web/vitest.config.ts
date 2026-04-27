import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
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
  },
});
