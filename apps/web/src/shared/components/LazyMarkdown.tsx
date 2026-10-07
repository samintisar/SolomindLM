import { lazy, type ReactNode, Suspense, useMemo } from "react";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { MarkdownRendererProps } from "./MarkdownRenderer.utils";

// Streamdown (with its code and math plugins) loads on first use, off the initial bundle.
const MarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

/** Generated content must not link out or embed media: links render as plain text, media as nothing. */
const GENERATED_CONTENT_COMPONENTS: NonNullable<MarkdownRendererProps["components"]> = {
  img: () => null,
  a: ({ children }) => <span>{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
};

function ParagraphSkeleton() {
  return (
    <div className="mx-auto max-w-prose space-y-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

interface LazyMarkdownProps extends MarkdownRendererProps {
  /** Shown while the renderer loads; three skeleton lines by default. */
  fallback?: ReactNode;
  /**
   * AI-generated content: links render as plain text and images, video, audio and iframes are
   * dropped. `components` still applies on top (e.g. table styling).
   */
  generated?: boolean;
}

/** `MarkdownRenderer`, code-split behind `Suspense`. */
export function LazyMarkdown({
  fallback = <ParagraphSkeleton />,
  generated = false,
  components,
  ...props
}: LazyMarkdownProps) {
  const resolvedComponents = useMemo(
    () => (generated ? { ...GENERATED_CONTENT_COMPONENTS, ...components } : components),
    [generated, components]
  );
  return (
    <Suspense fallback={fallback}>
      <MarkdownRenderer components={resolvedComponents} {...props} />
    </Suspense>
  );
}
