import { ChatColumn, PreviewWindow } from "./demo/PreviewWindow";
import { WrittenQuestionDemo } from "./demo/StudyDemo";

/**
 * The hero picture. md and up: the whole notebook (built at 860 × 640, shown at 76%) with the
 * written-question callout over its lower right. Phones: just the chat column, callout below.
 * Decorative: hidden from assistive tech and inert.
 */
export function NotebookPreview() {
  return (
    <div aria-hidden inert className="relative mx-auto w-full max-w-164 lg:mx-0">
      <div className="flex flex-col items-center md:hidden">
        <div className="w-full overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-hairline">
          <ChatColumn className="h-112" />
        </div>
        <WrittenQuestionDemo className="relative -mt-10 w-11/12" />
      </div>
      <div className="relative hidden h-122 md:block">
        <div className="absolute top-0 left-0 h-160 w-215 origin-top-left scale-76">
          <PreviewWindow className="h-full" />
        </div>
        <WrittenQuestionDemo className="absolute top-75 -right-10 w-78" />
      </div>
    </div>
  );
}
