/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_CONVEX_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "@vercel/analytics/react" {
  export const Analytics: React.ComponentType;
}

declare module "@vercel/speed-insights/react" {
  export const SpeedInsights: React.ComponentType;
}
