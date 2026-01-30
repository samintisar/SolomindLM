import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

/** Copy KaTeX fonts to public and rewrite CSS URLs so they resolve at build time. */
function katexFonts() {
  return {
    name: 'katex-fonts',
    enforce: 'pre' as const,
    buildStart() {
      const src = path.resolve(__dirname, 'node_modules/katex/dist/fonts');
      const dest = path.resolve(__dirname, 'public/katex/fonts');
      if (!fs.existsSync(src)) {
        const rootSrc = path.resolve(__dirname, '../../node_modules/katex/dist/fonts');
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
      if (id.includes('katex') && id.includes('katex.min.css')) {
        const raw = fs.readFileSync(id, 'utf-8');
        return raw.replace(/url\(fonts\//g, 'url(/katex/fonts/');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env from monorepo root and app dir so VITE_CONVEX_* are available
  const rootDir = path.resolve(__dirname, '..', '..');
  const env = { ...loadEnv(mode, rootDir, ''), ...loadEnv(mode, __dirname, '') };
  const convexSiteUrl =
    env.VITE_CONVEX_SITE_URL ||
    (env.VITE_CONVEX_URL && env.VITE_CONVEX_URL.replace('.cloud', '.site')) ||
    '';

  return {
    plugins: [react(), katexFonts()],
    optimizeDeps: {
      include: ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex'],
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@convex': path.resolve(__dirname, '../../convex'),
      },
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React ecosystem
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
              return 'react-vendor';
            }

            // LangChain AI libraries (very large)
            if (id.includes('node_modules/@langchain')) {
              return 'langchain';
            }

            // Supabase & Authentication
            if (id.includes('node_modules/@supabase')) {
              return 'supabase';
            }

            // Do NOT put react-markdown/remark/rehype in a manual chunk - it causes
            // "Cannot access 'X' before initialization" (circular dep in react-markdown
            // ecosystem when split; see https://github.com/vitejs/vite/issues/3592)

            // Mind mapping
            if (id.includes('node_modules/mind-elixir')) {
              return 'mindmap';
            }

            // Stripe
            if (id.includes('node_modules/@stripe')) {
              return 'stripe';
            }

            // Google Generative AI
            if (id.includes('node_modules/@google/generative-ai')) {
              return 'ai-vendor';
            }

            // Virtual DOM diffing
            if (id.includes('node_modules/react-virtuoso')) {
              return 'virtuoso';
            }

            // Icons (lucide-react)
            if (id.includes('node_modules/lucide-react')) {
              return 'icons';
            }

            // PDF generation
            if (id.includes('node_modules/html2pdf')) {
              return 'pdf';
            }

            // Math/KaTeX
            if (id.includes('node_modules/katex')) {
              return 'katex';
            }

            // HTML parsing
            if (id.includes('node_modules/cheerio')) {
              return 'cheerio';
            }

            // Don't put zod in its own chunk - it can become empty (tree-shaken) and trigger useless requests

            // Analytics (Vercel)
            if (id.includes('node_modules/@vercel')) {
              return 'analytics';
            }
          },
        },
      },
    },
  };
});
