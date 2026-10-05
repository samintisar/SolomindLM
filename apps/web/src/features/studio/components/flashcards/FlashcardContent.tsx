import { lazy, Suspense } from "react";
import type { Flashcard } from "@/shared/types";
import { sanitizeMarkdown } from "@/shared/utils";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

const answerMarkdownComponents = {
  img: () => null,
  a: ({ children }: { children?: React.ReactNode }) => (
    <span className="text-foreground">{children}</span>
  ),
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }: { children?: React.ReactNode }) => (
    <table className="w-full border-collapse overflow-hidden rounded-lg border border-border">
      {children}
    </table>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/50">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b border-border">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-r border-border px-4 py-2 text-left font-semibold text-foreground last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-r border-border px-4 py-2 text-foreground last:border-r-0">{children}</td>
  ),
};

function Skeleton() {
  return <div className="mx-auto h-6 w-3/4 max-w-full animate-pulse rounded bg-muted" />;
}

/** The question side of a card: markdown, plus True/False chips for true-false cards. */
export function FlashcardFront({ card }: { card: Flashcard }) {
  const text = card.type === "fill-blank" ? card.front.replace(/_+/g, "______") : card.front;
  const body = (
    <div className="prose max-w-none text-center">
      <Suspense fallback={<Skeleton />}>
        <MarkdownRenderer>{sanitizeMarkdown(text)}</MarkdownRenderer>
      </Suspense>
    </div>
  );

  if (card.type === "true-false") {
    return (
      <div className="w-full space-y-6 text-center">
        {body}
        <div className="flex justify-center gap-12 sm:gap-16">
          <span className="text-lg font-semibold text-success sm:text-xl">✓ True</span>
          <span className="text-lg font-semibold text-destructive sm:text-xl">✗ False</span>
        </div>
      </div>
    );
  }

  return <div className="w-full">{body}</div>;
}

/** The answer side of a card: markdown with media stripped; wide maths scrolls sideways. */
export function FlashcardBack({ card }: { card: Flashcard }) {
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <div className="prose w-full min-w-0 max-w-none text-center leading-relaxed text-foreground">
        <Suspense fallback={<Skeleton />}>
          <MarkdownRenderer components={answerMarkdownComponents}>
            {sanitizeMarkdown(card.back)}
          </MarkdownRenderer>
        </Suspense>
      </div>
    </div>
  );
}
