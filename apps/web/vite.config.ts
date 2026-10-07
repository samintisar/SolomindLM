import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";

/** Copy PDF.js worker to public so it is served locally (avoids unpkg CDN round-trip). */
function pdfjsWorker() {
  return {
    name: "pdfjs-worker",
    enforce: "pre" as const,
    buildStart() {
      const workerFile = "pdf.worker.min.mjs";
      const src = path.resolve(__dirname, "node_modules/pdfjs-dist/build", workerFile);
      const dest = path.resolve(__dirname, "public", workerFile);
      if (!fs.existsSync(src)) {
        const rootSrc = path.resolve(__dirname, "../../node_modules/pdfjs-dist/build", workerFile);
        if (fs.existsSync(rootSrc)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(rootSrc, dest);
          return;
        }
      }
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env from monorepo root and app dir so VITE_CONVEX_* are available
  const rootDir = path.resolve(__dirname, "..", "..");
  const env = { ...loadEnv(mode, rootDir, ""), ...loadEnv(mode, __dirname, "") };
  const convexSiteUrl =
    env.VITE_CONVEX_SITE_URL ||
    (env.VITE_CONVEX_URL && env.VITE_CONVEX_URL.replace(".cloud", ".site")) ||
    "";

  // App version stamped into feedback submissions / GitHub issues. Prefer an
  // explicit env var (CI can set it to the git sha), else the package version.
  const appVersion =
    env.VITE_APP_VERSION ||
    (() => {
      try {
        return JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))
          .version as string;
      } catch {
        return "unknown";
      }
    })();

  return {
    plugins: [react(), pdfjsWorker()],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-resizable-panels",
        "streamdown",
        "@streamdown/code",
        "@streamdown/math",
        "pdfjs-dist",
      ],
    },
    server: {
      // Allow WebView on phone/emulator to load the dev server via LAN IP (see apps/mobile/.env.local)
      host: true,
      allowedHosts: true,
      port: 5173,
      strictPort: true,
      // Google Identity Services popup flow can break without this opener policy.
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      },
      // SAME-DOMAIN PROXY for local development
      // Proxies /api/* to Convex so cookies work just like in production
      proxy: convexSiteUrl
        ? {
            "/api": {
              target: convexSiteUrl,
              changeOrigin: true,
              secure: true,
              configure: (proxy, _options) => {
                proxy.on("proxyReq", (proxyReq, _req, _res) => {
                  console.log(
                    "[Vite Proxy] Proxying:",
                    proxyReq.path,
                    "→",
                    convexSiteUrl + proxyReq.path
                  );
                });
                return proxy;
              },
            },
            // Convex http.ts serves /audio/:storageId on the .site deployment
            "/audio": {
              target: convexSiteUrl,
              changeOrigin: true,
              secure: true,
            },
          }
        : undefined,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@convex": path.resolve(__dirname, "../../convex"),
        react: path.resolve(rootDir, "node_modules/react"),
        "react-dom": path.resolve(rootDir, "node_modules/react-dom"),
      },
      dedupe: ["react", "react-dom"],
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React ecosystem. Whole package names only: a bare "node_modules/react" prefix also
            // caught react-pdf (pulling pdfjs into every page load) and react-virtuoso.
            if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) {
              return "react-vendor";
            }

            // Do NOT put streamdown / markdown-related deps in a manual chunk without
            // testing — similar circular-init issues have occurred with markdown stacks
            // when split (see https://github.com/vitejs/vite/issues/3592)

            // Virtual DOM diffing
            if (id.includes("node_modules/react-virtuoso")) {
              return "virtuoso";
            }

            // Icons (lucide-react)
            if (id.includes("node_modules/lucide-react")) {
              return "icons";
            }

            // Math/KaTeX. The stylesheet is imported eagerly from index.tsx; keeping it out of
            // this chunk stops the entry from statically pulling in the KaTeX JS.
            if (id.includes("node_modules/katex") && !id.endsWith(".css")) {
              return "katex";
            }

            // Don't put zod in its own chunk - it can become empty (tree-shaken) and trigger useless requests

            // PDF.js (heavy — keep separate from main bundle). Not react-pdf: Rollup folds a manual
            // chunk's dependencies into it, so react-pdf would drag clsx in and every page that
            // uses cn() would statically import pdfjs. react-pdf stays with its only importer.
            if (id.includes("node_modules/pdfjs-dist")) {
              return "pdfjs";
            }

            // Analytics (Vercel)
            if (id.includes("node_modules/@vercel")) {
              return "analytics";
            }
          },
        },
      },
    },
  };
});
