import { ChatColumn, PreviewWindow } from "./demo/PreviewWindow";
import { WrittenQuestionDemo } from "./demo/StudyDemo";

/**
 * The hero picture. md and up: the whole notebook, built at 860 × 640 and shown at 76% (64% in the
 * narrower lg column), with the written-question callout (at 90%, nearer the frame's type) over its lower left, where it
 * hides only empty space: Studio's saved list and the citation tooltip stay in view. Phones: just
 * the chat column, callout below. Decorative: hidden from assistive tech and inert.
 */
export function NotebookPreview() {
  return (
    <div aria-hidden inert className="relative mx-auto w-full max-w-164 lg:mx-0">
      <div className="flex flex-col items-center gap-4 md:hidden">
        <div className="w-full overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-hairline">
          <ChatColumn className="h-112" />
        </div>
        <WrittenQuestionDemo className="w-11/12" />
      </div>
      <div className="relative hidden h-122 md:mb-24 md:block lg:mb-24 lg:h-103 xl:mb-20 xl:h-122">
        <div className="absolute top-0 left-0 h-160 w-215 origin-top-left scale-76 lg:scale-64 xl:scale-76">
          <PreviewWindow className="h-full" />
        </div>
        <WrittenQuestionDemo className="absolute top-80 -left-6 w-80 origin-top-left scale-90 lg:top-76 lg:-left-3 lg:scale-80 xl:top-80 xl:-left-10 xl:scale-90" />
      </div>
    </div>
  );
}
