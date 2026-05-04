import { lazy } from "react";

export const MarkdownRendererLazy = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);
