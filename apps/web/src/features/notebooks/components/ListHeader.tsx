/** Column labels for list view; offsets match the row's 36px icon chip + 12px gap. */
export function ListHeader() {
  return (
    <div className="hidden items-center gap-3 border-b px-3 pb-2 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
      <span className="flex-1 pl-12">Title</span>
      <span className="w-40 text-right">Details</span>
      <span className="w-8" aria-hidden />
    </div>
  );
}
