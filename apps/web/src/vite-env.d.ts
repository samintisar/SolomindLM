/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_CONVEX_SITE_URL?: string;
  /** Overrides the Turnstile site key (default: production key; use 1x00000000000000000000BB to test). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** "1" bundles the dev-only /dev/design gallery into a production build. */
  readonly VITE_DESIGN_GALLERY?: string;
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
