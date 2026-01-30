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
  };
});
