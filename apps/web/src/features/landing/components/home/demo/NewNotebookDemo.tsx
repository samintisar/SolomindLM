import { BookOpen, FileText, Plus, Youtube } from "lucide-react";
import { DemoSurface } from "./DemoSurface";

/** Closing section: the brand-new notebook the visitor is about to make, over two ghost cards. */
export function NewNotebookDemo() {
  return (
    <div aria-hidden className="relative mx-auto h-96 w-full max-w-90 lg:mx-0">
      <div className="absolute top-0 left-16 hidden h-75 w-82 rotate-6 rounded-3xl bg-card opacity-55 shadow-md ring-1 ring-hairline sm:block" />
      <div className="absolute top-3.5 left-10 hidden h-75 w-82 rotate-3 rounded-3xl bg-card opacity-80 shadow-md ring-1 ring-hairline sm:block" />
      <DemoSurface
        elevation="floating"
        className="absolute top-8 left-0 w-full overflow-hidden rounded-3xl sm:w-90"
      >
        <div className="flex h-37 flex-col justify-between bg-primary p-5 text-primary-foreground">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-foreground/15">
            <BookOpen className="size-5" />
          </span>
          <span className="font-sans text-xs font-semibold tracking-widest uppercase opacity-80">
            New notebook
          </span>
        </div>
        <div className="p-5">
          <p className="flex items-center gap-1 font-display text-xl font-bold">
            Your course
            <span className="h-6 w-0.5 motion-safe:animate-pulse bg-primary" />
          </p>
          <p className="mt-1 font-sans text-xs text-muted-foreground">0 sources · start with one</p>
          <div className="mt-4 grid grid-cols-2 gap-2 font-sans text-xs text-muted-foreground">
            <span className="flex items-center gap-2 rounded-xl bg-muted/45 p-2.5 ring-1 ring-hairline ring-inset">
              <FileText className="size-3.5" />
              Lecture notes
            </span>
            <span className="flex items-center gap-2 rounded-xl bg-muted/45 p-2.5 ring-1 ring-hairline ring-inset">
              <Youtube className="size-3.5" />
              Recording
            </span>
            <span className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-primary p-2.5 font-semibold text-primary-foreground">
              <Plus className="size-3.5" />
              Add your first source
            </span>
          </div>
        </div>
      </DemoSurface>
    </div>
  );
}
