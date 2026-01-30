import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env from monorepo root and app dir so VITE_CONVEX_* are available
  const rootDir = path.resolve(__dirname, '..', '..');
  const env = { ...loadEnv(mode, rootDir, ''), ...loadEnv(mode, __dirname, '') };
  const convexSiteUrl =
    env.VITE_CONVEX_SITE_URL ||
    (env.VITE_CONVEX_URL && env.VITE_CONVEX_URL.replace('.cloud', '.site')) ||
    '';

  return {
    plugins: [react()],
    optimizeDeps: {
      include: ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex'],
    },
    server: {
      port: 5173,
      strictPort: true,
      // Proxy /auth to Convex in dev so requests are same-origin and CORS is avoided (only when Convex URL is set)
      ...(convexSiteUrl && {
        proxy: {
          '/auth': {
            target: convexSiteUrl,
            changeOrigin: true,
          },
        },
      }),
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

            // Markdown & Rich Text processing
            if (id.includes('node_modules/react-markdown') ||
                id.includes('node_modules/remark') ||
                id.includes('node_modules/rehype')) {
              return 'markdown';
            }

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

            // Validation
            if (id.includes('node_modules/zod')) {
              return 'zod';
            }

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
