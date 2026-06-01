import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";

/** Copy KaTeX fonts to public and rewrite CSS URLs so they resolve at build time. */
function katexFonts() {
  return {
    name: "katex-fonts",
    enforce: "pre" as const,
    buildStart() {
      const src = path.resolve(__dirname, "node_modules/katex/dist/fonts");
      const dest = path.resolve(__dirname, "public/katex/fonts");
      if (!fs.existsSync(src)) {
        const rootSrc = path.resolve(__dirname, "../../node_modules/katex/dist/fonts");
        if (fs.existsSync(rootSrc)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.cpSync(rootSrc, dest, { recursive: true });
          return;
        }
      }
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(src, dest, { recursive: true });
      }
    },
    // Run before Vite resolves CSS url() so rewritten paths aren't treated as relative
    load(id: string) {
      if (id.includes("katex") && id.includes("katex.min.css")) {
        const raw = fs.readFileSync(id, "utf-8");
        return raw.replace(/url\(fonts\//g, "url(/katex/fonts/");
      }
    },
  };
}

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

  return {
    plugins: [react(), katexFonts(), pdfjsWorker()],
    optimizeDeps: {
      include: ["streamdown", "@streamdown/code", "@streamdown/math", "pdfjs-dist"],
    },
    server: {
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
      },
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React ecosystem
            if (
              id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom") ||
              id.includes("node_modules/react-router")
            ) {
              return "react-vendor";
            }

            // LangChain AI libraries (very large)
            if (id.includes("node_modules/@langchain")) {
              return "langchain";
            }

            // Supabase & Authentication
            if (id.includes("node_modules/@supabase")) {
              return "supabase";
            }

            // Do NOT put streamdown / markdown-related deps in a manual chunk without
            // testing — similar circular-init issues have occurred with markdown stacks
            // when split (see https://github.com/vitejs/vite/issues/3592)

            // Mind mapping
            if (id.includes("node_modules/mind-elixir")) {
              return "mindmap";
            }

            // Stripe
            if (id.includes("node_modules/@stripe")) {
              return "stripe";
            }

            // Google Generative AI
            if (id.includes("node_modules/@google/generative-ai")) {
              return "ai-vendor";
            }

            // Virtual DOM diffing
            if (id.includes("node_modules/react-virtuoso")) {
              return "virtuoso";
            }

            // Icons (lucide-react)
            if (id.includes("node_modules/lucide-react")) {
              return "icons";
            }

            // Math/KaTeX
            if (id.includes("node_modules/katex")) {
              return "katex";
            }

            // HTML parsing
            if (id.includes("node_modules/cheerio")) {
              return "cheerio";
            }

            // Don't put zod in its own chunk - it can become empty (tree-shaken) and trigger useless requests

            // PDF.js (heavy — keep separate from main bundle)
            if (id.includes("node_modules/pdfjs-dist") || id.includes("node_modules/react-pdf")) {
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
